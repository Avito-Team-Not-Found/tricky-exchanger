package chain

import (
	"context"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	chainservice "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/chain"
)

// chainService описывает сценарии цепочек, используемые HTTP-обработчиком.
type chainService interface {
	List(ctx context.Context, userID string) ([]entity.Chain, error)
	ListForOffer(ctx context.Context, userID string, offerID int64) ([]entity.Chain, error)
	Get(ctx context.Context, userID string, chainID int64) (entity.Chain, error)
	Vote(ctx context.Context, userID string, chainID int64, input chainservice.VoteInput) (entity.ChainVote, error)
	WithdrawVote(ctx context.Context, userID string, chainID int64, input chainservice.VoteInput) error
}
