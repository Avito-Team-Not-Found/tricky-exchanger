package exchange_request

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	requestservice "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/exchange_request"
)

// Postgres хранит заявки на обмен в PostgreSQL.
// Инвалидация кандидатных цепочек выполняется здесь же, поэтому новая версия
// заявки не может быть сохранена при активной цепочке со старой версией.
type Postgres struct {
	pool *pgxpool.Pool
}

// NewRepository создаёт репозиторий заявок на обмен на базе пула PostgreSQL.
func NewRepository(pool *pgxpool.Pool) *Postgres {
	return &Postgres{pool: pool}
}

// Create сохраняет новую активную заявку после проверки предлагаемого товара.
func (r *Postgres) Create(ctx context.Context, request entity.ExchangeOffer) (entity.ExchangeOffer, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return entity.ExchangeOffer{}, fmt.Errorf("begin create exchange request: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := ensureActiveOwnedItem(ctx, tx, request.UserID, request.OfferedItemID); err != nil {
		return entity.ExchangeOffer{}, err
	}

	const query = `
		INSERT INTO exchange_requests (
			user_id, offered_item_id, wanted_description, want_embedding,
			status, version
		)
		VALUES ($1, $2, $3, $4::vector, $5, 1)
		RETURNING id, status, version, created_at, updated_at
	`

	created := request
	err = tx.QueryRow(
		ctx,
		query,
		request.UserID,
		request.OfferedItemID,
		request.WantedDescription,
		vectorLiteral(request.WantEmbedding),
		entity.RequestStatusActive,
	).Scan(
		&created.ID,
		&created.Status,
		&created.Version,
		&created.CreatedAt,
		&created.UpdatedAt,
	)
	if err != nil {
		return entity.ExchangeOffer{}, fmt.Errorf("insert exchange request: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return entity.ExchangeOffer{}, fmt.Errorf("commit create exchange request: %w", err)
	}

	return created, nil
}

// Get возвращает неархивную заявку пользователя по идентификатору.
func (r *Postgres) Get(ctx context.Context, userID string, requestID int64) (entity.ExchangeOffer, error) {
	const query = `
		SELECT id, user_id, offered_item_id, wanted_description,
		       status, version, created_at, updated_at
		FROM exchange_requests
		WHERE id = $1 AND user_id = $2 AND status <> 'REMOVED'
	`

	request, err := scanExchangeOffer(r.pool.QueryRow(ctx, query, requestID, userID))
	if errors.Is(err, pgx.ErrNoRows) {
		return entity.ExchangeOffer{}, entity.ErrExchangeRequestNotFound
	}
	if err != nil {
		return entity.ExchangeOffer{}, fmt.Errorf("get exchange request: %w", err)
	}

	return request, nil
}

// List возвращает неархивные заявки пользователя вместе с названиями товаров.
func (r *Postgres) List(ctx context.Context, userID string) ([]entity.ExchangeOfferListItem, error) {
	// The join fetches card data in this single query, avoiding N+1 lookups of
	// offered item titles in the HTTP list endpoint.
	const query = `
		SELECT er.id, er.user_id, er.offered_item_id, er.wanted_description,
		       er.status, er.version, er.created_at,
		       er.updated_at, i.title
		FROM exchange_requests AS er
		JOIN items AS i ON i.id = er.offered_item_id
		WHERE er.user_id = $1 AND er.status <> 'REMOVED'
		ORDER BY er.created_at DESC, er.id DESC
	`

	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("list exchange requests: %w", err)
	}
	defer rows.Close()

	requests := make([]entity.ExchangeOfferListItem, 0)
	for rows.Next() {
		var item entity.ExchangeOfferListItem
		if err := rows.Scan(
			&item.ID,
			&item.UserID,
			&item.OfferedItemID,
			&item.WantedDescription,
			&item.Status,
			&item.Version,
			&item.CreatedAt,
			&item.UpdatedAt,
			&item.OfferedItemTitle,
		); err != nil {
			return nil, fmt.Errorf("scan exchange request list row: %w", err)
		}
		requests = append(requests, item)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate exchange request list: %w", err)
	}

	return requests, nil
}

// Update изменяет заявку, проверяет версию и инвалидирует затронутые цепочки.
func (r *Postgres) Update(ctx context.Context, request entity.ExchangeOffer, expectedVersion int64) (entity.ExchangeOffer, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return entity.ExchangeOffer{}, fmt.Errorf("begin update exchange request: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := ensureMutableRequest(ctx, tx, request.ID, request.UserID, expectedVersion); err != nil {
		return entity.ExchangeOffer{}, err
	}

	if err := ensureActiveOwnedItem(ctx, tx, request.UserID, request.OfferedItemID); err != nil {
		return entity.ExchangeOffer{}, err
	}

	const query = `
		UPDATE exchange_requests
		SET offered_item_id = $3,
		    wanted_description = $4,
		    want_embedding = $5::vector,
		    version = version + 1,
		    updated_at = now()
		WHERE id = $1
		  AND user_id = $2
		  AND version = $6
		  AND status NOT IN ('LOCKED', 'REMOVED')
		RETURNING id, user_id, offered_item_id, wanted_description,
		          status, version, created_at, updated_at
	`

	updated, err := scanExchangeOffer(tx.QueryRow(
		ctx,
		query,
		request.ID,
		request.UserID,
		request.OfferedItemID,
		request.WantedDescription,
		vectorLiteral(request.WantEmbedding),
		expectedVersion,
	))
	if err != nil {
		if mapped := mutationError(ctx, tx, request.ID, request.UserID, expectedVersion, err); mapped != nil {
			return entity.ExchangeOffer{}, mapped
		}
		return entity.ExchangeOffer{}, fmt.Errorf("update exchange request: %w", err)
	}

	if err := invalidateCandidateChains(ctx, tx, updated.ID, "request_changed"); err != nil {
		return entity.ExchangeOffer{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return entity.ExchangeOffer{}, fmt.Errorf("commit update exchange request: %w", err)
	}

	return updated, nil
}

// Archive архивирует заявку, проверяет версию и инвалидирует затронутые цепочки.
func (r *Postgres) Archive(ctx context.Context, userID string, requestID, expectedVersion int64) (entity.ExchangeOffer, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return entity.ExchangeOffer{}, fmt.Errorf("begin archive exchange request: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	const query = `
		UPDATE exchange_requests
		SET status = 'REMOVED',
		    version = version + 1,
		    updated_at = now()
		WHERE id = $1
		  AND user_id = $2
		  AND version = $3
		  AND status NOT IN ('LOCKED', 'REMOVED')
		RETURNING id, user_id, offered_item_id, wanted_description,
		          status, version, created_at, updated_at
	`

	archived, err := scanExchangeOffer(tx.QueryRow(ctx, query, requestID, userID, expectedVersion))
	if err != nil {
		if mapped := mutationError(ctx, tx, requestID, userID, expectedVersion, err); mapped != nil {
			return entity.ExchangeOffer{}, mapped
		}
		return entity.ExchangeOffer{}, fmt.Errorf("archive exchange request: %w", err)
	}

	if err := invalidateCandidateChains(ctx, tx, archived.ID, "request_archived"); err != nil {
		return entity.ExchangeOffer{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return entity.ExchangeOffer{}, fmt.Errorf("commit archive exchange request: %w", err)
	}

	return archived, nil
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanExchangeOffer(row rowScanner) (entity.ExchangeOffer, error) {
	var request entity.ExchangeOffer
	err := row.Scan(
		&request.ID,
		&request.UserID,
		&request.OfferedItemID,
		&request.WantedDescription,
		&request.Status,
		&request.Version,
		&request.CreatedAt,
		&request.UpdatedAt,
	)
	return request, err
}

func ensureActiveOwnedItem(ctx context.Context, tx pgx.Tx, userID string, itemID int64) error {
	const query = `
		SELECT EXISTS (
			SELECT 1
			FROM items
			WHERE id = $1
			  AND owner_user_id = $2
			  AND status = 'ACTIVE'
		)
	`

	var exists bool
	if err := tx.QueryRow(ctx, query, itemID, userID).Scan(&exists); err != nil {
		return fmt.Errorf("verify offered item: %w", err)
	}
	if !exists {
		return entity.ErrOfferedItemUnavailable
	}
	return nil
}

func ensureMutableRequest(ctx context.Context, tx pgx.Tx, requestID int64, userID string, expectedVersion int64) error {
	var status entity.RequestStatus
	var currentVersion int64
	err := tx.QueryRow(ctx, `
		SELECT status, version
		FROM exchange_requests
		WHERE id = $1 AND user_id = $2
		FOR UPDATE
	`, requestID, userID).Scan(&status, &currentVersion)
	if errors.Is(err, pgx.ErrNoRows) {
		return entity.ErrExchangeRequestNotFound
	}
	if err != nil {
		return fmt.Errorf("lock exchange request for update: %w", err)
	}
	if status == entity.RequestStatusLocked {
		return entity.ErrExchangeRequestLocked
	}
	if status == entity.RequestStatusRemoved {
		return entity.ErrExchangeRequestNotFound
	}
	if currentVersion != expectedVersion {
		return entity.ErrExchangeRequestVersionConflict
	}
	return nil
}

func invalidateCandidateChains(ctx context.Context, tx pgx.Tx, requestID int64, reason string) error {
	const query = `
		UPDATE chains AS c
		SET status = 'BROKEN',
		    invalid_reason = $2,
		    version = version + 1,
		    updated_at = now()
		WHERE c.status = 'CANDIDATE'
		  AND EXISTS (
			SELECT 1
			FROM chain_participants AS cp
			WHERE cp.chain_id = c.id
			  AND cp.request_id = $1
		)
	`
	if _, err := tx.Exec(ctx, query, requestID, reason); err != nil {
		return fmt.Errorf("invalidate candidate chains: %w", err)
	}
	return nil
}

func mutationError(ctx context.Context, tx pgx.Tx, requestID int64, userID string, expectedVersion int64, original error) error {
	if !errors.Is(original, pgx.ErrNoRows) {
		return nil
	}

	var status entity.RequestStatus
	var currentVersion int64
	err := tx.QueryRow(ctx, `
		SELECT status, version
		FROM exchange_requests
		WHERE id = $1 AND user_id = $2
	`, requestID, userID).Scan(&status, &currentVersion)
	if errors.Is(err, pgx.ErrNoRows) {
		return entity.ErrExchangeRequestNotFound
	}
	if err != nil {
		return fmt.Errorf("inspect failed exchange request mutation: %w", err)
	}
	if status == entity.RequestStatusLocked {
		return entity.ErrExchangeRequestLocked
	}
	if currentVersion != expectedVersion {
		return entity.ErrExchangeRequestVersionConflict
	}
	return entity.ErrExchangeRequestNotFound
}

func vectorLiteral(vector []float32) string {
	parts := make([]string, len(vector))
	for i, value := range vector {
		parts[i] = strconv.FormatFloat(float64(value), 'f', -1, 32)
	}
	return "[" + strings.Join(parts, ",") + "]"
}

var _ requestservice.ExchangeRequestRepository = (*Postgres)(nil)
