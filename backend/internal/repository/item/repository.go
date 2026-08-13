// Package item — PostgreSQL-доступ к items.
package item

import (
	"context"
	"errors"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository"
)

type Postgres struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Postgres {
	return &Postgres{pool: pool}
}

func (r *Postgres) Create(ctx context.Context, item *entity.Item) error {
	const q = `
		INSERT INTO items (owner_user_id, title, description, category, embedding, status)
		VALUES ($1, $2, $3, $4, $5::vector, $6)
		RETURNING id, created_at, updated_at
	`

	err := r.pool.QueryRow(
		ctx, q,
		item.OwnerUserID, item.Title, item.Description, item.Category,
		vectorLiteral(item.Embedding), item.Status,
	).Scan(&item.ID, &item.CreatedAt, &item.UpdatedAt)
	if err != nil {
		if mappedErr, ok := repository.DBErrToErr(err); ok {
			return mappedErr
		}
		return err
	}

	return nil
}

func (r *Postgres) GetByID(ctx context.Context, id int64) (*entity.Item, error) {
	const q = `
		SELECT id, owner_user_id, title, description, COALESCE(category, ''), image_url, status, created_at, updated_at
		FROM items
		WHERE id = $1
	`

	item, err := scanItem(r.pool.QueryRow(ctx, q, id))
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			if mappedErr, ok := repository.DBErrToErr(err); ok {
				return nil, mappedErr
			}
			return nil, err
		}
		return nil, repository.ErrNotFound
	}

	return item, nil
}

func (r *Postgres) ListByOwner(ctx context.Context, ownerID uuid.UUID, page, pageSize int) ([]*entity.Item, int, error) {
	const q = `
		SELECT id, owner_user_id, title, description, COALESCE(category, ''), image_url, status, created_at, updated_at,
		       count(*) OVER() AS total
		FROM items
		WHERE owner_user_id = $1
		ORDER BY created_at DESC, id DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.pool.Query(ctx, q, ownerID, pageSize, (page-1)*pageSize)
	if err != nil {
		if mappedErr, ok := repository.DBErrToErr(err); ok {
			return nil, 0, mappedErr
		}
		return nil, 0, err
	}
	defer rows.Close()

	items := make([]*entity.Item, 0)
	total := 0
	for rows.Next() {
		var it entity.Item
		if err := rows.Scan(
			&it.ID, &it.OwnerUserID, &it.Title, &it.Description, &it.Category, &it.ImageURL,
			&it.Status, &it.CreatedAt, &it.UpdatedAt, &total,
		); err != nil {
			if mappedErr, ok := repository.DBErrToErr(err); ok {
				return nil, 0, mappedErr
			}
			return nil, 0, err
		}
		items = append(items, &it)
	}

	if err := rows.Err(); err != nil {
		if mappedErr, ok := repository.DBErrToErr(err); ok {
			return nil, 0, mappedErr
		}
		return nil, 0, err
	}

	return items, total, nil
}

func (r *Postgres) Update(ctx context.Context, item *entity.Item) error {
	const q = `
		UPDATE items
		SET title = $2,
		    description = $3,
		    category = $4,
		    status = $5,
		    embedding = COALESCE($6::vector, embedding),
		    updated_at = now()
		WHERE id = $1
		RETURNING updated_at
	`

	err := r.pool.QueryRow(
		ctx, q,
		item.ID, item.Title, item.Description, item.Category, item.Status,
		optionalVectorLiteral(item.Embedding),
	).Scan(&item.UpdatedAt)
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			if mappedErr, ok := repository.DBErrToErr(err); ok {
				return mappedErr
			}
			return err
		}
		return repository.ErrNotFound
	}

	return nil
}

func (r *Postgres) UpdateStatus(ctx context.Context, id int64, status entity.ItemStatus) error {
	const q = `
		UPDATE items
		SET status = $2,
		    updated_at = now()
		WHERE id = $1
	`

	tag, err := r.pool.Exec(ctx, q, id, status)
	if err != nil {
		if mappedErr, ok := repository.DBErrToErr(err); ok {
			return mappedErr
		}
		return err
	}
	if tag.RowsAffected() == 0 {
		return repository.ErrNotFound
	}

	return nil
}

func (r *Postgres) UpdateImageURL(ctx context.Context, id int64, url string) error {
	const q = `
		UPDATE items
		SET image_url = $2,
		    updated_at = now()
		WHERE id = $1
	`

	tag, err := r.pool.Exec(ctx, q, id, url)
	if err != nil {
		if mappedErr, ok := repository.DBErrToErr(err); ok {
			return mappedErr
		}
		return err
	}
	if tag.RowsAffected() == 0 {
		return repository.ErrNotFound
	}

	return nil
}

func (r *Postgres) CategoryExists(ctx context.Context, categoryID int64) (bool, error) {
	const q = `SELECT EXISTS (SELECT 1 FROM categories WHERE id = $1)`

	var exists bool
	if err := r.pool.QueryRow(ctx, q, categoryID).Scan(&exists); err != nil {
		if mappedErr, ok := repository.DBErrToErr(err); ok {
			return false, mappedErr
		}
		return false, err
	}

	return exists, nil
}

// HasActiveHardReservation — заявка в IN_PROPOSAL/LOCKED (мутации товара запрещены).
func (r *Postgres) HasActiveHardReservation(ctx context.Context, itemID int64) (bool, error) {
	const q = `
		SELECT EXISTS (
			SELECT 1
			FROM exchange_offers
			WHERE offered_item_id = $1
			  AND status IN ('LOCKED', 'IN_PROPOSAL')
		)
	`

	var exists bool
	if err := r.pool.QueryRow(ctx, q, itemID).Scan(&exists); err != nil {
		if mappedErr, ok := repository.DBErrToErr(err); ok {
			return false, mappedErr
		}
		return false, err
	}
	return exists, nil
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanItem(row rowScanner) (*entity.Item, error) {
	var it entity.Item
	err := row.Scan(
		&it.ID, &it.OwnerUserID, &it.Title, &it.Description, &it.Category, &it.ImageURL,
		&it.Status, &it.CreatedAt, &it.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &it, nil
}

func optionalVectorLiteral(vector []float32) any {
	if len(vector) == 0 {
		return nil
	}
	return vectorLiteral(vector)
}

func vectorLiteral(vector []float32) string {
	parts := make([]string, len(vector))
	for i, value := range vector {
		parts[i] = strconv.FormatFloat(float64(value), 'f', -1, 32)
	}
	return "[" + strings.Join(parts, ",") + "]"
}
