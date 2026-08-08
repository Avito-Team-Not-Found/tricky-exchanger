// Package category содержит postgres-реализацию доступа к таблице categories.
package category

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository"
)

// Postgres — postgres-реализация доступа к справочнику категорий.
type Postgres struct {
	pool *pgxpool.Pool
}

// NewRepository создаёт репозиторий категорий на базе пула PostgreSQL.
func NewRepository(pool *pgxpool.Pool) *Postgres {
	return &Postgres{pool: pool}
}

// List возвращает весь справочник категорий, отсортированный по названию (алфавит).
func (r *Postgres) List(ctx context.Context) ([]entity.Category, error) {
	const q = `
		SELECT id, name
		FROM categories
		ORDER BY name
	`

	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("list categories: %w", repository.MapDBError(err))
	}
	defer rows.Close()

	categories := make([]entity.Category, 0)
	for rows.Next() {
		var c entity.Category
		if err := rows.Scan(&c.ID, &c.Name); err != nil {
			return nil, fmt.Errorf("scan category row: %w", err)
		}
		categories = append(categories, c)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate categories: %w", err)
	}

	return categories, nil
}