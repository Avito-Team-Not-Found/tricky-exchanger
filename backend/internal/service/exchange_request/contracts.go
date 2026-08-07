package exchange_request

import (
	"context"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

// ExchangeRequestService описывает публичный контракт сценариев работы с заявками.
// Handler зависит от этого интерфейса, поэтому для его тестов можно подставить mock.
type ExchangeRequestService interface {
	Create(ctx context.Context, userID string, input CreateInput) (entity.ExchangeRequest, error)
	Get(ctx context.Context, userID string, requestID int64) (entity.ExchangeRequest, error)
	List(ctx context.Context, userID string) ([]entity.ExchangeRequestListItem, error)
	Update(ctx context.Context, userID string, requestID int64, input UpdateInput) (entity.ExchangeRequest, error)
	Delete(ctx context.Context, userID string, requestID, version int64) error
}
