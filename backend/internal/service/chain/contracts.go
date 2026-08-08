package chain

import (
	"context"
	"time"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/database"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

// Repository описывает хранилище, необходимое сервису цепочек.
type Repository interface {
	SaveCandidates(ctx context.Context, tx database.Tx, drafts []entity.ChainDraft) error
	List(ctx context.Context, userID string) ([]entity.Chain, error)
	ListForOffer(ctx context.Context, userID string, offerID int64) ([]entity.Chain, error)
	Get(ctx context.Context, userID string, chainID int64) (entity.Chain, error)
	LockForVote(ctx context.Context, tx database.Tx, chainID int64) (entity.ChainStatus, int, error)
	ValidateVoteParticipants(ctx context.Context, tx database.Tx, userID string, chainID, requestID, targetRequestID int64, chainLength int) error
	GetVote(ctx context.Context, tx database.Tx, userID string, chainID, requestID, targetRequestID int64) (entity.ChainVote, error)
	UpsertPendingVote(ctx context.Context, tx database.Tx, chainID, requestID, targetRequestID int64) (time.Time, error)
	DeletePendingVote(ctx context.Context, tx database.Tx, chainID, requestID, targetRequestID int64) error
	ListPendingVoteEdges(ctx context.Context, tx database.Tx, chainID int64) ([]entity.VoteEdge, error)
	Propose(ctx context.Context, tx database.Tx, chainID int64, requestIDsByPosition []int64) error
	MarkRequestInProposal(ctx context.Context, tx database.Tx, requestID int64) error
	RestoreActiveIfNoPendingVotes(ctx context.Context, tx database.Tx, requestID int64) error
	LoadScoreFeatures(ctx context.Context, tx database.Tx, chainID int64) (cosines []float64, reliability []float64, sizes []int, err error)
	CountPendingVoters(ctx context.Context, tx database.Tx, chainID int64) (int, error)
	UpdateScore(ctx context.Context, tx database.Tx, chainID int64, score float64) error
}

// Notifier отправляет пользовательские уведомления о событиях цепочки
// (например, письма о замыкании цикла). Подключается явно; до подключения
// сервис работает без уведомлений.
type Notifier interface {
	NotifyChainProposed(ctx context.Context, chainID int64, participants []entity.ChainParticipant) error
}
