package chain

import (
	"context"
	"time"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/database"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

const FreezeTTL = 24 * time.Hour

// ChainRebuilder пересобирает цепочки после вычёркивания участников из
// конкурентов; реализует MatchingFacade.RepairAffectedChains.
type ChainRebuilder interface {
	RepairAffectedChains(ctx context.Context, tx database.Tx, affected []int64) error
}

type FreezeService struct {
	repository Repository
	rebuilder  ChainRebuilder
}

func NewFreezeService(repository Repository, rebuilder ChainRebuilder) *FreezeService {
	return &FreezeService{repository: repository, rebuilder: rebuilder}
}

func (s *FreezeService) Freeze(ctx context.Context, tx database.Tx, chainID int64) error {
	if s.repository == nil {
		return entity.ErrChainRepositoryNotConfigured
	}
	requestIDs, err := s.repository.LoadChainRequestIDs(ctx, tx, chainID)
	if err != nil {
		return err
	}
	if err := s.assertNoDoubleFreeze(ctx, tx, requestIDs); err != nil {
		return err
	}
	deadline := time.Now().Add(FreezeTTL)
	if err := s.repository.FreezeChain(ctx, tx, chainID, deadline); err != nil {
		return err
	}
	if err := s.repository.LockRequestsInChain(ctx, tx, chainID); err != nil {
		return err
	}
	if err := s.repository.MarkItemsUnavailable(ctx, tx, chainID); err != nil {
		return err
	}
	affected, err := s.repository.ReleaseCompetitorsFromOtherChains(ctx, tx, chainID)
	if err != nil {
		return err
	}
	if s.rebuilder != nil {
		return s.rebuilder.RepairAffectedChains(ctx, tx, affected)
	}
	return nil
}

func (s *FreezeService) assertNoDoubleFreeze(ctx context.Context, tx database.Tx, requestIDs []int64) error {
	for _, requestID := range requestIDs {
		status, err := s.repository.LoadRequestLiveChainStatus(ctx, tx, requestID)
		if err != nil {
			return err
		}
		if status == entity.ChainStatusFrozen {
			return entity.ErrRequestInTwoFrozenChains
		}
	}
	return nil
}