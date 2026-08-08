package matching

import (
	"context"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/database"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

// ClusterSynchronizer описывает часть matching, отвечающую за актуальное
// членство заявки в кластере.
type ClusterSynchronizer interface {
	Synchronize(ctx context.Context, tx database.Tx, offerID int64) error
	Remove(ctx context.Context, tx database.Tx, offerID int64) error
}

// CycleSearcher описывает поиск вариантов цепочки после актуализации кластера.
type CycleSearcher interface {
	Find(ctx context.Context, tx database.Tx, startRequestID int64) ([]entity.ChainDraft, error)
}

// CandidateChainSaver сохраняет найденные варианты цепочек в текущей транзакции.
type CandidateChainSaver interface {
	SaveCandidates(ctx context.Context, tx database.Tx, drafts []entity.ChainDraft) error
}

// MatchingFacade связывает CRUD заявок с кластеризацией и поиском вариантов цепочек.
type MatchingFacade struct {
	clusters ClusterSynchronizer
	cycles   CycleSearcher
	chains   CandidateChainSaver
	ranker   *ChainScoreCalculator
}

func (f *MatchingFacade) WithRanker(r *ChainScoreCalculator) *MatchingFacade {
	f.ranker = r
	return f
}

// NewFacade создаёт рабочий matching-фасад.
func NewFacade(clusters ClusterSynchronizer, cycles CycleSearcher, chains CandidateChainSaver) *MatchingFacade {
	return &MatchingFacade{clusters: clusters, cycles: cycles, chains: chains}
}

// RebuildForRequest синхронно актуализирует производные данные заявки.
func (f *MatchingFacade) RebuildForRequest(
	ctx context.Context,
	tx database.Tx,
	requestID int64,
) ([]entity.ChainDraft, error) {
	if f.clusters == nil {
		return nil, entity.ErrClusterNotConfigured
	}
	if err := f.clusters.Synchronize(ctx, tx, requestID); err != nil {
		return nil, err
	}
	if f.cycles == nil {
		return []entity.ChainDraft{}, nil
	}
	drafts, err := f.cycles.Find(ctx, tx, requestID)
	if err != nil {
		return nil, err
	}
	if len(drafts) > 0 {
		if f.chains == nil {
			return nil, entity.ErrChainRepositoryNotConfigured
		}
		if f.ranker == nil {
			return nil, entity.ErrScoreNotConfigured
		}
		// Score считает Ranker, один раз на каждую собранную цепочку —
		// перед созданием. CycleFinder не считает score и не отбирает топ-N.
		for i := range drafts {
			score, err := f.ranker.Score(chainStateFromDraft(drafts[i]))
			if err != nil {
				return nil, err
			}
			drafts[i].Score = score
		}
		if err := f.chains.SaveCandidates(ctx, tx, drafts); err != nil {
			return nil, err
		}
	}
	return drafts, nil
}

// RemoveRequest удаляет заявку из производных данных matching.
func (f *MatchingFacade) RemoveRequest(ctx context.Context, tx database.Tx, requestID int64) error {
	if f.clusters == nil {
		return entity.ErrClusterNotConfigured
	}
	return f.clusters.Remove(ctx, tx, requestID)
}

// chainStateFromDraft переносит сырые данные фич из драфта (собранные CycleFinder'ом)
// в ChainState для ChainScoreCalculator. Один вызов Ranker перед созданием цепочки.
func chainStateFromDraft(draft entity.ChainDraft) ChainState {
	return ChainState{
		Count:                   len(draft.Participants),
		Stage:                   ChainStateCandidate,
		Event:                   EventAdd,
		EdgeCosines:             draft.EdgeCosines,
		ParticipantReliability:  draft.ParticipantReliability,
		ParticipantClusterSizes: draft.ClusterSizes,
		ApprovedVotes:           0,
	}
}
