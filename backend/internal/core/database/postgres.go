package database

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Connect создаёт пул подключений к PostgreSQL и проверяет доступность БД.
// Дополнительно проверяет, что расширение pgvector установлено.
func Connect(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("create connection pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("database is unreachable: %w", err)
	}

	var hasVector bool
	if err := pool.QueryRow(ctx,
		"SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector')",
	).Scan(&hasVector); err != nil {
		pool.Close()
		return nil, fmt.Errorf("check pgvector extension: %w", err)
	}

	if !hasVector {
		pool.Close()
		return nil, fmt.Errorf("pgvector extension is NOT installed. Run `make up` (docker-compose migrate service) first")
	}

	return pool, nil
}
