package search

import (
	"github.com/jackc/pgx/v5/pgxpool"
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
