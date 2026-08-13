package chain

import (
	"github.com/jackc/pgx/v5/pgxpool"

	chainservice "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/chain"
)

// Postgres хранит цепочки и их участников в PostgreSQL.
type Postgres struct {
	pool              *pgxpool.Pool
	matchingThreshold float64
}

var _ chainservice.Repository = (*Postgres)(nil)

// NewRepository создаёт репозиторий цепочек.
func NewRepository(pool *pgxpool.Pool, thresholds ...float64) *Postgres {
	threshold := 0.5
	if len(thresholds) > 0 && thresholds[0] > 0 && thresholds[0] <= 1 {
		threshold = thresholds[0]
	}
	return &Postgres{pool: pool, matchingThreshold: threshold}
}
