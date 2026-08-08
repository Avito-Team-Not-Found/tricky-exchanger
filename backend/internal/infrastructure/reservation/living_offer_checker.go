package reservation

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// LivingOfferChecker проверяет наличие «живой» заявки на товар в статусах
// мягкой/жёсткой блокировки (IN_PROPOSAL / LOCKED). Такой товар нельзя
// редактировать, архивировать или менять ему фото.
type LivingOfferChecker struct {
	pool *pgxpool.Pool
}

// NewLivingOfferChecker создаёт проверку лока на основе статусов заявок.
func NewLivingOfferChecker(pool *pgxpool.Pool) *LivingOfferChecker {
	return &LivingOfferChecker{pool: pool}
}

// HasActiveHardReservation реализует service/item.ReservationChecker.
func (c *LivingOfferChecker) HasActiveHardReservation(ctx context.Context, itemID int64) (bool, error) {
	const q = `
		SELECT EXISTS (
			SELECT 1
			FROM exchange_offers
			WHERE offered_item_id = $1
			  AND status IN ('LOCKED', 'IN_PROPOSAL')
		)
	`

	var exists bool
	if err := c.pool.QueryRow(ctx, q, itemID).Scan(&exists); err != nil {
		return false, fmt.Errorf("check living offer on item: %w", err)
	}
	return exists, nil
}