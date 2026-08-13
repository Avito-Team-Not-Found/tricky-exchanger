// Package chainnotification delivers chain events to the owners of participating offers.
package chainnotification

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Sender interface {
	SendChainFrozen(to string, chainID int64) error
	SendReplacementInvitation(to string, chainID int64) error
}

type Notifier struct {
	pool   *pgxpool.Pool
	sender Sender
}

func New(pool *pgxpool.Pool, sender Sender) *Notifier {
	return &Notifier{pool: pool, sender: sender}
}

func (n *Notifier) NotifyChainFrozen(ctx context.Context, chainID int64) error {
	rows, err := n.pool.Query(ctx, `
		SELECT DISTINCT u.email
		FROM chain_participants AS cp
		JOIN exchange_offers AS eo ON eo.id = cp.request_id
		JOIN users AS u ON u.id = eo.user_id
		WHERE cp.chain_id = $1
		ORDER BY u.email`, chainID)
	if err != nil {
		return fmt.Errorf("load frozen chain recipients: %w", err)
	}
	defer rows.Close()

	var sendErrors []error
	for rows.Next() {
		var email string
		if err := rows.Scan(&email); err != nil {
			return fmt.Errorf("scan frozen chain recipient: %w", err)
		}
		if err := n.sender.SendChainFrozen(email, chainID); err != nil {
			sendErrors = append(sendErrors, fmt.Errorf("send frozen chain notification to %s: %w", email, err))
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate frozen chain recipients: %w", err)
	}
	return errors.Join(sendErrors...)
}

func (n *Notifier) NotifyReplacementInvited(ctx context.Context, chainID, requestID int64) error {
	var email string
	err := n.pool.QueryRow(ctx, `
		SELECT u.email
		FROM chain_participants AS cp
		JOIN exchange_offers AS eo ON eo.id = cp.request_id
		JOIN users AS u ON u.id = eo.user_id
		WHERE cp.chain_id = $1 AND cp.request_id = $2`, chainID, requestID).Scan(&email)
	if errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("replacement request %d is not pinned to chain %d", requestID, chainID)
	}
	if err != nil {
		return fmt.Errorf("load replacement recipient: %w", err)
	}
	if err := n.sender.SendReplacementInvitation(email, chainID); err != nil {
		return fmt.Errorf("send replacement invitation to %s: %w", email, err)
	}
	return nil
}
