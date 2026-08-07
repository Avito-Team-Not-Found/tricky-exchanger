package exchange_request

import (
	"context"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

// ExchangeRequestRepository описывает хранилище заявок, необходимое сервису.
// Реализация должна атомарно инвалидировать кандидатные цепочки при изменении заявки.
type ExchangeRequestRepository interface {
	Create(ctx context.Context, request entity.ExchangeOffer) (entity.ExchangeOffer, error)
	Get(ctx context.Context, userID string, requestID int64) (entity.ExchangeOffer, error)
	List(ctx context.Context, userID string) ([]entity.ExchangeOfferListItem, error)
	Update(ctx context.Context, request entity.ExchangeOffer, expectedVersion int64) (entity.ExchangeOffer, error)
	Archive(ctx context.Context, userID string, requestID, expectedVersion int64) (entity.ExchangeOffer, error)
}
