package cluster

import (
	"github.com/jackc/pgx/v5/pgxpool"
)

// Postgres управляет составом кластеров в переданной транзакции.
type Postgres struct {
	pool *pgxpool.Pool
}

// NewRepository создаёт репозиторий кластеров с ограниченным Top-K поиском.
func NewRepository(pool *pgxpool.Pool) *Postgres {
	return &Postgres{pool: pool}
}
