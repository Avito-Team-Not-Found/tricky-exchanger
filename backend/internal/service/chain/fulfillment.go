package chain

import (
	"context"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/database"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

func (s *Service) Handoff(ctx context.Context, chainID, requestID int64) (FulfillmentResult, error) {
	if s.repository == nil || s.transactions == nil {
		return FulfillmentResult{}, entity.ErrChainRepositoryNotConfigured
	}
	if chainID <= 0 || requestID <= 0 {
		return FulfillmentResult{}, entity.ErrHandoffRequestInvalid
	}
	if err := s.expireDue(ctx); err != nil {
		return FulfillmentResult{}, err
	}

	result := FulfillmentResult{ChainID: chainID, RequestID: requestID}
	err := s.transactions.WithinTransaction(ctx, func(tx database.Tx) error {
		status, _, err := s.repository.LockForVote(ctx, tx, chainID)
		if err != nil {
			return err
		}
		if status != entity.ChainStatusFrozen &&
			status != entity.ChainStatusInProgress &&
			status != entity.ChainStatusCompleted {
			return entity.ErrChainNotReadyForHandoff
		}

		if _, err := s.repository.MarkRequestInProgress(ctx, tx, chainID, requestID); err != nil {
			return err
		}
		if status == entity.ChainStatusFrozen {
			if err := s.repository.StartChain(ctx, tx, chainID); err != nil {
				return err
			}
			result.Status = entity.ChainStatusInProgress
			return nil
		}
		result.Status = status
		return nil
	})
	if err != nil {
		return FulfillmentResult{}, err
	}
	return result, nil
}

// ConfirmReceipt records that the authenticated recipient received the item
// from requestID. The chain completes after every pinned request is DONE.

func (s *Service) ConfirmReceipt(
	ctx context.Context,
	userID string,
	chainID, requestID int64,
) (FulfillmentResult, error) {
	if s.repository == nil || s.transactions == nil {
		return FulfillmentResult{}, entity.ErrChainRepositoryNotConfigured
	}
	if chainID <= 0 || requestID <= 0 {
		return FulfillmentResult{}, entity.ErrHandoffRequestInvalid
	}
	if err := s.expireDue(ctx); err != nil {
		return FulfillmentResult{}, err
	}

	result := FulfillmentResult{ChainID: chainID, RequestID: requestID}
	err := s.transactions.WithinTransaction(ctx, func(tx database.Tx) error {
		status, _, err := s.repository.LockForVote(ctx, tx, chainID)
		if err != nil {
			return err
		}
		if status != entity.ChainStatusInProgress && status != entity.ChainStatusCompleted {
			return entity.ErrChainNotReadyForHandoff
		}

		requestStatus, err := s.repository.FindReceiptRequestStatus(ctx, tx, chainID, requestID, userID)
		if err != nil {
			return err
		}
		if requestStatus == entity.RequestStatusLocked {
			return entity.ErrChainHandoffPending
		}
		if requestStatus != entity.RequestStatusInProgress && requestStatus != entity.RequestStatusDone {
			return entity.ErrChainHandoffPending
		}

		if err := s.repository.MarkRequestDone(ctx, tx, requestID); err != nil {
			return err
		}
		if status == entity.ChainStatusCompleted {
			result.Status = status
			return nil
		}

		complete, err := s.repository.AllChainRequestsDone(ctx, tx, chainID)
		if err != nil {
			return err
		}
		if !complete {
			result.Status = entity.ChainStatusInProgress
			return nil
		}
		if err := s.repository.CompleteChain(ctx, tx, chainID); err != nil {
			return err
		}
		result.Status = entity.ChainStatusCompleted
		return nil
	})
	if err != nil {
		return FulfillmentResult{}, err
	}
	return result, nil
}

// ListChainsContainingRequest возвращает цепочки, где участвует заявка.
