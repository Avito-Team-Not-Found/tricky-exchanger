// Package search содержит параметризованный векторный поиск кандидатов (задача SCRUM-24).
//
// pgvector отвечает ТОЛЬКО за нахождение семантически близких кандидатов (Top-K или
// по порогу подобия). Сам поиск циклов и построение кластеров выполняются в Go поверх
// результатов этих функций.
//
// Два направления сравнения соответствуют модели бартера, где у каждой заявки есть
// "отдаю" (items.embedding) и "получаю" (exchange_offers.want_embedding):
//
//   - Исходящие кандидаты (Find*Outgoing): по моему want_embedding ищу чужие ACTIVE
//     предметы, которые я хочу получить. Предмет и подобие 1 - (items.embedding <=> want).
//   - Входящие кандидаты (Find*Incoming): по embedding моего отдаваемого предмета ищу
//     чужие ACTIVE заявки, чей want_embedding близок к моему предмету — те, кому я могу
//     отдать свой предмет. Подобие 1 - (er.want_embedding <=> item).
//
// Оба направления доступны в двух формах:
//   - ByThreshold — возвращают ВСЕ кандидаты, прошедшие порог (используется при
//     формировании кластеров: нужно именно множество, без жёсткого лимита).
//   - TopK — возвращают K лучших (ORDER BY ... LIMIT K). Используется на этапе
//     поиска цепочек (BFS), чтобы не раздувать граф.
//
// Все запросы выполняют фильтрацию и сортировку на стороне SQL (WHERE + ORDER BY ... <=>),
// поэтому используют HNSW-индекс и НЕ загружают все строки таблицы в память.
package search

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

// CandidateSearcher — контракт векторного поиска кандидатов.
// Реализация опирается на индекс vector_cosine_ops, поэтому метрика всегда cosine.

// Search реализует CandidateSearcher поверх пула PostgreSQL.
type Search struct {
	pool *pgxpool.Pool
}

// New создаёт Search. Нужен пул уже подключённой БД.
func New(pool *pgxpool.Pool) *Search {
	return &Search{pool: pool}
}


// constQueryOutgoing — поиск предметов, близких к want_embedding.
// Параметры: $1 вектор, $2 исключаемый пользователь, $3 порог | $4 = k.
//
// Причина фильтров:
//   - i.status='ACTIVE' и er.status='ACTIVE' — недоступные (заблокированные/архивные)
//     предметы и заявки исключаются сразу на SQL: совпадения в них искать нельзя
//     (критерий приёмки "в недоступных заявках совпадения не ищутся").
//   - er.user_id <> $2 — не показываем человеку его собственные предметы.
//   - i.embedding IS NOT NULL — без вектора не с чем сравнивать.
//
// ORDER BY i.embedding <=> $1 ранжирует по близости; оператор <=> (cosine distance)
// согласован с HNSW-индексом idx_items_embedding (vector_cosine_ops).
// Подобие считается как 1 - distance.
const constQueryOutgoingThreshold = `
	SELECT er.id AS request_id, i.id AS item_id, er.user_id AS owner_id,
	       1 - (i.embedding <=> $1) AS score
	FROM items i
	JOIN exchange_offers er ON er.offered_item_id = i.id
	WHERE i.status = 'ACTIVE'
	  AND er.status = 'ACTIVE'
	  AND er.user_id <> $2
	  AND i.embedding IS NOT NULL
	  AND 1 - (i.embedding <=> $1) >= $3
	ORDER BY i.embedding <=> $1
`

const constQueryOutgoingTopK = `
	SELECT er.id AS request_id, i.id AS item_id, er.user_id AS owner_id,
	       1 - (i.embedding <=> $1) AS score
	FROM items i
	JOIN exchange_offers er ON er.offered_item_id = i.id
	WHERE i.status = 'ACTIVE'
	  AND er.status = 'ACTIVE'
	  AND er.user_id <> $2
	  AND i.embedding IS NOT NULL
	ORDER BY i.embedding <=> $1
	LIMIT $3
`

// constQueryIncoming* — поиск заявок, чей want_embedding близок к предмету.
// Параметры: $1 вектор, $2 исключаемый пользователь, $3 порог | $4 = k.
// Аналогичные фильтры недоступности и исключение себя; ORDER BY по индексу
// idx_er_want_embedding (vector_cosine_ops).
const constQueryIncomingThreshold = `
	SELECT er.id AS request_id, er.offered_item_id AS item_id, er.user_id AS owner_id,
	       1 - (er.want_embedding <=> $1) AS score
	FROM exchange_offers er
	JOIN items oi ON oi.id = er.offered_item_id
	WHERE er.status = 'ACTIVE'
	  AND er.want_embedding IS NOT NULL
	  AND er.user_id <> $2
	  AND oi.status = 'ACTIVE'
	  AND 1 - (er.want_embedding <=> $1) >= $3
	ORDER BY er.want_embedding <=> $1
`

const constQueryIncomingTopK = `
	SELECT er.id AS request_id, er.offered_item_id AS item_id, er.user_id AS owner_id,
	       1 - (er.want_embedding <=> $1) AS score
	FROM exchange_offers er
	JOIN items oi ON oi.id = er.offered_item_id
	WHERE er.status = 'ACTIVE'
	  AND er.want_embedding IS NOT NULL
	  AND er.user_id <> $2
	  AND oi.status = 'ACTIVE'
	ORDER BY er.want_embedding <=> $1
	LIMIT $3
`

// FindOutgoingByThreshold ищет чужие предметы, похожие на want, с порогом подобия.
func (s *Search) FindOutgoingByThreshold(ctx context.Context, want []float32, excludeUserID string, threshold float64) ([]entity.Candidate, error) {
	rows, err := s.pool.Query(ctx, constQueryOutgoingThreshold, embedLiteral(want), excludeUserID, threshold)
	if err != nil {
		return nil, fmt.Errorf("search outgoing by threshold: %w", err)
	}
	return collectCandidates(rows)
}

// FindIncomingByThreshold ищет чужие заявки, чей want_embedding похож на предмет.
func (s *Search) FindIncomingByThreshold(ctx context.Context, mine []float32, excludeUserID string, threshold float64) ([]entity.Candidate, error) {
	rows, err := s.pool.Query(ctx, constQueryIncomingThreshold, embedLiteral(mine), excludeUserID, threshold)
	if err != nil {
		return nil, fmt.Errorf("search incoming by threshold: %w", err)
	}
	return collectCandidates(rows)
}

// FindOutgoingTopK возвращает K лучших чужих предметов, близких к want.
func (s *Search) FindOutgoingTopK(ctx context.Context, want []float32, excludeUserID string, k int) ([]entity.Candidate, error) {
	rows, err := s.pool.Query(ctx, constQueryOutgoingTopK, embedLiteral(want), excludeUserID, k)
	if err != nil {
		return nil, fmt.Errorf("search outgoing top-k: %w", err)
	}
	return collectCandidates(rows)
}

// FindIncomingTopK возвращает K лучших чужих заявок, чей want_embedding близок к предмету.
func (s *Search) FindIncomingTopK(ctx context.Context, mine []float32, excludeUserID string, k int) ([]entity.Candidate, error) {
	rows, err := s.pool.Query(ctx, constQueryIncomingTopK, embedLiteral(mine), excludeUserID, k)
	if err != nil {
		return nil, fmt.Errorf("search incoming top-k: %w", err)
	}
	return collectCandidates(rows)
}

// collectCandidates читает строки результата и собирает список кандидатов.
func collectCandidates(rows pgx.Rows) ([]entity.Candidate, error) {
	defer rows.Close()

	candidates := make([]entity.Candidate, 0)
	for rows.Next() {
		var c entity.Candidate
		if err := rows.Scan(&c.RequestID, &c.ItemID, &c.OwnerID, &c.Score); err != nil {
			return nil, fmt.Errorf("scan candidate: %w", err)
		}
		candidates = append(candidates, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate candidates: %w", err)
	}
	return candidates, nil
}
