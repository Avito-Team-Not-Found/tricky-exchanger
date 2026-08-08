package chain

import (
	"context"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

// chainService описывает сценарии цепочек, используемые HTTP-обработчиком.
type chainService interface {
	List(ctx context.Context, userID string) ([]entity.Chain, error)
	ListForOffer(ctx context.Context, userID string, offerID int64) ([]entity.Chain, error)
	Get(ctx context.Context, userID string, chainID int64) (entity.Chain, error)
}
