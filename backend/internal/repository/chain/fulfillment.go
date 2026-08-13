package chain

import (
	"context"
	"errors"
	"fmt"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/database"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository"
	"github.com/jackc/pgx/v5"
)

// MarkRequestInProgress records an external handoff for a request pinned in a
// frozen chain. Repeated callbacks leave an already started or completed
// request unchanged.
func (r *Postgres) MarkRequestInProgress(
	ctx context.Context,
	tx database.Tx,
	chainID, requestID int64,
) (entity.RequestStatus, error) {
	var status entity.RequestStatus
	err := tx.QueryRow(ctx, `
		SELECT eo.status
		FROM chain_participants AS cp
		JOIN exchange_offers AS eo ON eo.id = cp.request_id
		WHERE cp.chain_id = $1 AND cp.request_id = $2
		FOR UPDATE OF eo
	`, chainID, requestID).Scan(&status)
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			return "", repository.MapDBErr(err)
		}
		return "", entity.ErrHandoffRequestInvalid
	}

	switch status {
	case entity.RequestStatusLocked:
		if _, err := tx.Exec(ctx, `
			UPDATE exchange_offers
			SET status = 'IN_PROGRESS', updated_at = NOW()
			WHERE id = $1
		`, requestID); err != nil {
			return "", repository.MapDBErr(err)
		}
		return entity.RequestStatusInProgress, nil
	case entity.RequestStatusInProgress, entity.RequestStatusDone:
		return status, nil
	default:
		return "", entity.ErrHandoffRequestInvalid
	}
}

// StartChain promotes a frozen chain after its first confirmed handoff.
func (r *Postgres) StartChain(ctx context.Context, tx database.Tx, chainID int64) error {
	result, err := tx.Exec(ctx, `
		UPDATE chains
		SET status = 'IN_PROGRESS', version = version + 1, updated_at = NOW()
		WHERE id = $1 AND status = 'FROZEN'
	`, chainID)
	if err != nil {
		return repository.MapDBErr(err)
	}
	if result.RowsAffected() != 1 {
		return entity.ErrChainNotReadyForHandoff
	}
	return nil
}

// FindReceiptRequestStatus verifies that userID is the physical recipient of
// requestID. A participant gives its item to the previous chain position.
func (r *Postgres) FindReceiptRequestStatus(
	ctx context.Context,
	tx database.Tx,
	chainID, requestID int64,
	userID string,
) (entity.RequestStatus, error) {
	var status entity.RequestStatus
	err := tx.QueryRow(ctx, `
		SELECT source_offer.status
		FROM chain_participants AS source
		JOIN chains AS chain ON chain.id = source.chain_id
		JOIN exchange_offers AS source_offer ON source_offer.id = source.request_id
		JOIN chain_participants AS recipient
		  ON recipient.chain_id = source.chain_id
		 AND recipient.position = (source.position - 1 + chain.length) % chain.length
		JOIN exchange_offers AS recipient_offer ON recipient_offer.id = recipient.request_id
		WHERE source.chain_id = $1
		  AND source.request_id = $2
		  AND recipient_offer.user_id = $3
		FOR UPDATE OF source_offer
	`, chainID, requestID, userID).Scan(&status)
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			return "", repository.MapDBErr(err)
		}
		return "", entity.ErrChainReceiptForbidden
	}
	return status, nil
}

// MarkRequestDone closes a handed-off request after its recipient confirms
// receipt. Retrying a completed acknowledgement is intentionally successful.
func (r *Postgres) MarkRequestDone(ctx context.Context, tx database.Tx, requestID int64) error {
	result, err := tx.Exec(ctx, `
		UPDATE exchange_offers
		SET status = 'DONE', updated_at = NOW()
		WHERE id = $1 AND status = 'IN_PROGRESS'
	`, requestID)
	if err != nil {
		return repository.MapDBErr(err)
	}
	if result.RowsAffected() == 1 {
		return nil
	}

	var status entity.RequestStatus
	if err := tx.QueryRow(ctx, `SELECT status FROM exchange_offers WHERE id = $1`, requestID).Scan(&status); err != nil {
		return repository.MapDBErr(err)
	}
	if status == entity.RequestStatusDone {
		return nil
	}
	return entity.ErrChainHandoffPending
}

// AllChainRequestsDone reports whether every pinned request has been received.
func (r *Postgres) AllChainRequestsDone(ctx context.Context, tx database.Tx, chainID int64) (bool, error) {
	var complete bool
	err := tx.QueryRow(ctx, `
		SELECT COUNT(*) > 0
		   AND COUNT(*) FILTER (WHERE eo.status = 'DONE') = COUNT(*)
		FROM chain_participants AS cp
		JOIN exchange_offers AS eo ON eo.id = cp.request_id
		WHERE cp.chain_id = $1
	`, chainID).Scan(&complete)
	if err != nil {
		return false, repository.MapDBErr(err)
	}
	return complete, nil
}

// CompleteChain finalizes the aggregate state only after all pinned requests
// have been received.
func (r *Postgres) CompleteChain(ctx context.Context, tx database.Tx, chainID int64) error {
	result, err := tx.Exec(ctx, `
		UPDATE chains
		SET status = 'COMPLETED', version = version + 1, updated_at = NOW()
		WHERE id = $1 AND status = 'IN_PROGRESS'
	`, chainID)
	if err != nil {
		return repository.MapDBErr(err)
	}
	if result.RowsAffected() != 1 {
		return entity.ErrChainNotReadyForHandoff
	}
	if _, err := tx.Exec(ctx, `
		UPDATE items AS item
		SET status = 'ARCHIVED', updated_at = NOW()
		WHERE item.status = 'UNAVAILABLE'
		  AND item.id IN (
			SELECT offer.offered_item_id
			FROM chain_participants AS participant
			JOIN exchange_offers AS offer ON offer.id = participant.request_id
			WHERE participant.chain_id = $1
		  )
	`, chainID); err != nil {
		return fmt.Errorf("archive exchanged items: %w", err)
	}
	return nil
}
