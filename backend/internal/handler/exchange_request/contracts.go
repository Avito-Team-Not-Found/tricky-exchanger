package exchange_request

import (
	"context"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	requestservice "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/exchange_request"
)

// exchangeRequestService — контракт зависимостей HTTP-обработчика заявок.
type exchangeRequestService interface {
	Create(ctx context.Context, userID string, input requestservice.CreateInput) (entity.ExchangeOffer, error)
	Get(ctx context.Context, userID string, requestID int64) (entity.ExchangeOffer, error)
	List(ctx context.Context, userID string) ([]entity.ExchangeOfferListItem, error)
	Update(ctx context.Context, userID string, requestID int64, input requestservice.UpdateInput) (entity.ExchangeOffer, error)
	Delete(ctx context.Context, userID string, requestID, version int64) error
}
