// Package item содержит postgres-реализацию доступа к таблице items.
package item

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository"
)

// Postgres — postgres-реализация доступа к таблице items.
type Postgres struct {
	pool *pgxpool.Pool
}

// NewRepository создаёт репозиторий товаров на базе пула PostgreSQL.
func NewRepository(pool *pgxpool.Pool) *Postgres {
	return &Postgres{pool: pool}
}

// Create сохраняет новый товар. Заполняет ID, Status, CreatedAt, UpdatedAt в переданной структуре.
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
		return fmt.Errorf("insert item: %w", repository.DBError(err))
	}

	return nil
}

// GetByID возвращает товар по идентификатору вне зависимости от владельца —
// проверку прав доступа выполняет вызывающий слой (service).
func (r *Postgres) GetByID(ctx context.Context, id int64) (*entity.Item, error) {
	const q = `
		SELECT id, owner_user_id, title, description, COALESCE(category, ''), image_url, status, created_at, updated_at
		FROM items
		WHERE id = $1
	`

	item, err := scanItem(r.pool.QueryRow(ctx, q, id))
	if err != nil {
		return nil, fmt.Errorf("get item: %w", repository.DBError(err))
	}

	return item, nil
}

// ListByOwner возвращает страницу товаров владельца (включая архивные — это его личный список)
// и общее количество товаров, отсортированные по дате создания (новые сверху).
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
		return nil, 0, fmt.Errorf("list items by owner: %w", repository.DBError(err))
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
			return nil, 0, fmt.Errorf("scan item list row: %w", err)
		}
		items = append(items, &it)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate item list: %w", err)
	}

	return items, total, nil
}

// Update перезаписывает редактируемые поля товара (title/description/category/status)
// и обновляет updated_at. Если товар не найден — repository.ErrNotFound.
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
		return fmt.Errorf("update item: %w", repository.DBError(err))
	}

	return nil
}

// UpdateStatus меняет статус товара (используется для архивации). Если товар
// не найден — repository.ErrNotFound.
func (r *Postgres) UpdateStatus(ctx context.Context, id int64, status entity.ItemStatus) error {
	const q = `
		UPDATE items
		SET status = $2,
		    updated_at = now()
		WHERE id = $1
	`

	tag, err := r.pool.Exec(ctx, q, id, status)
	if err != nil {
		return fmt.Errorf("update item status: %w", repository.DBError(err))
	}
	if tag.RowsAffected() == 0 {
		return repository.ErrNotFound
	}

	return nil
}

// UpdateImageURL сохраняет ссылку на загруженное в MinIO фото товара. Если товар
// не найден — repository.ErrNotFound.
func (r *Postgres) UpdateImageURL(ctx context.Context, id int64, url string) error {
	const q = `
		UPDATE items
		SET image_url = $2,
		    updated_at = now()
		WHERE id = $1
	`

	tag, err := r.pool.Exec(ctx, q, id, url)
	if err != nil {
		return fmt.Errorf("update item image url: %w", repository.DBError(err))
	}
	if tag.RowsAffected() == 0 {
		return repository.ErrNotFound
	}

	return nil
}

// CategoryExists проверяет, что категория с указанным ID существует в справочнике.
func (r *Postgres) CategoryExists(ctx context.Context, categoryID int64) (bool, error) {
	const q = `SELECT EXISTS (SELECT 1 FROM categories WHERE id = $1)`

	var exists bool
	if err := r.pool.QueryRow(ctx, q, categoryID).Scan(&exists); err != nil {
		return false, fmt.Errorf("check category exists: %w", err)
	}

	return exists, nil
}

// HasActiveHardReservation сообщает, есть ли у товара «живая» заявка в статусах
// мягкой/жёсткой блокировки (IN_PROPOSAL / LOCKED). Такой товар нельзя
// редактировать, архивировать или менять ему фото.
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
		return false, fmt.Errorf("check living offer on item: %w", err)
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