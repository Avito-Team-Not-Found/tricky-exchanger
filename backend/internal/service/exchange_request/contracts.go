package exchange_request

import (
	"context"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

// ExchangeRequestRepository описывает хранилище заявок, необходимое сервису.
// Реализация должна атомарно инвалидировать кандидатные цепочки при изменении заявки.
type ExchangeRequestRepository interface {
	Create(ctx context.Context, request entity.ExchangeRequest) (entity.ExchangeRequest, error)
	Get(ctx context.Context, userID string, requestID int64) (entity.ExchangeRequest, error)
	List(ctx context.Context, userID string) ([]ListItem, error)
	Update(ctx context.Context, request entity.ExchangeRequest, expectedVersion int64) (entity.ExchangeRequest, error)
	Archive(ctx context.Context, userID string, requestID, expectedVersion int64) (entity.ExchangeRequest, error)
}

// ListItem содержит заявку и название её предлагаемого товара,
// загруженные одним запросом без N+1.
type ListItem struct {
	entity.ExchangeRequest
	OfferedItemTitle string
}
