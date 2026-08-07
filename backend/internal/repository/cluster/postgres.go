// Package cluster содержит PostgreSQL-репозиторий кластеров предложений.
package cluster

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

const (
	defaultCandidateLimit = 50
	defaultMaxDistance    = 0.20
)

// Postgres управляет составом кластеров в переданной транзакции.
type Postgres struct {
	pool        *pgxpool.Pool
	candidateN  int
	maxDistance float64
}

// NewRepository создаёт репозиторий кластеров с ограниченным Top-K поиском.
func NewRepository(pool *pgxpool.Pool) *Postgres {
	return &Postgres{
		pool:        pool,
		candidateN:  defaultCandidateLimit,
		maxDistance: defaultMaxDistance,
	}
}

// Synchronize удаляет старое членство предложения и добавляет его в кластер,
// найденный по близости отдаваемого товара и желаемого товара.
// Метод должен выполняться в той же транзакции, что и изменение предложения.
func (r *Postgres) Synchronize(ctx context.Context, tx pgx.Tx, offerID int64) error {
	offerEmbedding, wantEmbedding, err := r.vectorLiterals(ctx, tx, offerID)
	if err != nil {
		return err
	}

	oldClusterID, err := r.deleteMembership(ctx, tx, offerID)
	if err != nil {
		return err
	}
	if oldClusterID != nil {
		if err := r.refresh(ctx, tx, *oldClusterID); err != nil {
			return err
		}
	}

	clusterID, err := r.findCandidateCluster(ctx, tx, offerID, offerEmbedding, wantEmbedding)
	if err != nil {
		return err
	}
	if clusterID == nil {
		clusterID, err = r.createCluster(ctx, tx)
		if err != nil {
			return err
		}
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO cluster_members (cluster_id, request_id)
		VALUES ($1, $2)
	`, *clusterID, offerID); err != nil {
		return fmt.Errorf("add offer to cluster: %w", err)
	}

	return r.refresh(ctx, tx, *clusterID)
}

// Remove удаляет предложение из кластера и актуализирует метаданные кластера.
// Метод должен выполняться в той же транзакции, что и архивирование предложения.
func (r *Postgres) Remove(ctx context.Context, tx pgx.Tx, offerID int64) error {
	clusterID, err := r.deleteMembership(ctx, tx, offerID)
	if err != nil {
		return err
	}
	if clusterID == nil {
		return nil
	}
	return r.refresh(ctx, tx, *clusterID)
}

// ListActiveMembers возвращает текущий состав активного кластера. Метод нужен
// сервисам поиска цепочек и быстрой замены, которые дополнительно проверяют
// точную совместимость конкретных предложений.
func (r *Postgres) ListActiveMembers(ctx context.Context, clusterID int64) ([]entity.ExchangeOffer, error) {
	const query = `
		SELECT eo.id, eo.user_id, eo.offered_item_id, eo.wanted_description,
		       eo.status, eo.version, eo.created_at, eo.updated_at
		FROM cluster_members AS cm
		JOIN exchange_offers AS eo ON eo.id = cm.request_id AND eo.status = 'ACTIVE'
		WHERE cm.cluster_id = $1
		ORDER BY eo.id
	`

	rows, err := r.pool.Query(ctx, query, clusterID)
	if err != nil {
		return nil, fmt.Errorf("list active cluster members: %w", err)
	}
	defer rows.Close()

	members := make([]entity.ExchangeOffer, 0)
	for rows.Next() {
		var offer entity.ExchangeOffer
		if err := rows.Scan(
			&offer.ID,
			&offer.UserID,
			&offer.OfferedItemID,
			&offer.WantedDescription,
			&offer.Status,
			&offer.Version,
			&offer.CreatedAt,
			&offer.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan active cluster member: %w", err)
		}
		members = append(members, offer)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate active cluster members: %w", err)
	}
	return members, nil
}

func (r *Postgres) vectorLiterals(ctx context.Context, tx pgx.Tx, offerID int64) (string, string, error) {
	var offerEmbedding *string
	var wantEmbedding *string
	err := tx.QueryRow(ctx, `
		SELECT i.embedding::text, eo.want_embedding::text
		FROM exchange_offers AS eo
		JOIN items AS i ON i.id = eo.offered_item_id
		WHERE eo.id = $1 AND eo.status = 'ACTIVE'
	`, offerID).Scan(&offerEmbedding, &wantEmbedding)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", entity.ErrExchangeOfferNotFound
	}
	if err != nil {
		return "", "", fmt.Errorf("load offer vectors for clustering: %w", err)
	}
	if offerEmbedding == nil || wantEmbedding == nil {
		return "", "", entity.ErrOfferEmbeddingMissing
	}
	return *offerEmbedding, *wantEmbedding, nil
}

func (r *Postgres) deleteMembership(ctx context.Context, tx pgx.Tx, offerID int64) (*int64, error) {
	var clusterID int64
	err := tx.QueryRow(ctx, `
		DELETE FROM cluster_members
		WHERE request_id = $1
		RETURNING cluster_id
	`, offerID).Scan(&clusterID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("remove offer from previous cluster: %w", err)
	}
	return &clusterID, nil
}

func (r *Postgres) findCandidateCluster(
	ctx context.Context,
	tx pgx.Tx,
	offerID int64,
	offerEmbedding string,
	wantEmbedding string,
) (*int64, error) {
	const query = `
		WITH nearest_by_offer AS MATERIALIZED (
			SELECT cm.cluster_id,
			       eo.want_embedding <=> $2::vector AS want_distance,
			       i.embedding <=> $1::vector AS offer_distance
			FROM items AS i
			JOIN exchange_offers AS eo ON eo.offered_item_id = i.id
			JOIN cluster_members AS cm ON cm.request_id = eo.id
			WHERE eo.status = 'ACTIVE'
			  AND eo.id <> $3
			  AND i.embedding IS NOT NULL
			  AND eo.want_embedding IS NOT NULL
			ORDER BY i.embedding <=> $1::vector
			LIMIT $4
		)
		SELECT cluster_id
		FROM nearest_by_offer
		WHERE offer_distance <= $5
		  AND want_distance <= $5
		ORDER BY offer_distance + want_distance, cluster_id
		LIMIT 1
	`

	var clusterID int64
	err := tx.QueryRow(ctx, query, offerEmbedding, wantEmbedding, offerID, r.candidateN, r.maxDistance).Scan(&clusterID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find similar offers for cluster: %w", err)
	}
	return &clusterID, nil
}

func (r *Postgres) createCluster(ctx context.Context, tx pgx.Tx) (*int64, error) {
	var clusterID int64
	err := tx.QueryRow(ctx, `
		INSERT INTO clusters (epsilon)
		VALUES (0)
		RETURNING id
	`).Scan(&clusterID)
	if err != nil {
		return nil, fmt.Errorf("create cluster: %w", err)
	}
	return &clusterID, nil
}

func (r *Postgres) refresh(ctx context.Context, tx pgx.Tx, clusterID int64) error {
	const deleteQuery = `
		DELETE FROM clusters AS c
		WHERE c.id = $1
		  AND NOT EXISTS (
			SELECT 1 FROM cluster_members AS cm WHERE cm.cluster_id = c.id
		)
	`
	if _, err := tx.Exec(ctx, deleteQuery, clusterID); err != nil {
		return fmt.Errorf("delete empty cluster: %w", err)
	}

	const refreshQuery = `
		WITH centroid AS (
			SELECT avg(i.embedding) AS value
			FROM cluster_members AS cm
			JOIN exchange_offers AS eo ON eo.id = cm.request_id
			JOIN items AS i ON i.id = eo.offered_item_id
			WHERE cm.cluster_id = $1
		), stats AS (
			SELECT COALESCE(max(i.embedding <=> centroid.value), 0) AS epsilon
			FROM cluster_members AS cm
			JOIN exchange_offers AS eo ON eo.id = cm.request_id
			JOIN items AS i ON i.id = eo.offered_item_id
			CROSS JOIN centroid
			WHERE cm.cluster_id = $1
		)
		UPDATE clusters AS c
		SET centroid_embedding = centroid.value,
		    epsilon = stats.epsilon,
		    updated_at = now()
		FROM centroid, stats
		WHERE c.id = $1
		  AND centroid.value IS NOT NULL
	`
	if _, err := tx.Exec(ctx, refreshQuery, clusterID); err != nil {
		return fmt.Errorf("refresh cluster centroid: %w", err)
	}
	return nil
}
