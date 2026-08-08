package chain

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/database"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	chainservice "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/chain"
)

// Postgres хранит цепочки и их участников в PostgreSQL.
type Postgres struct {
	pool *pgxpool.Pool
}

const loadVisibleChainsQuery = `
	SELECT c.id, c.status, COALESCE(c.score, 0), c.length,
	       c.freeze_deadline_at, c.invalid_reason, c.version,
	       c.created_at, c.updated_at,
	       viewer.request_id, viewer.position
	FROM chains AS c
	JOIN LATERAL (
		SELECT member.request_id, cp.position, COALESCE(cp.cluster_id, 0) AS cluster_id
		FROM chain_participants AS cp
		JOIN cluster_members AS member ON member.cluster_id = cp.cluster_id
		JOIN exchange_offers AS eo ON eo.id = member.request_id
		WHERE cp.chain_id = c.id
		  AND eo.user_id = $1
		  AND eo.status = 'ACTIVE'
		ORDER BY cp.position
		LIMIT 1
	) AS viewer ON true
	WHERE c.status IN ('CANDIDATE', 'PROPOSED', 'FROZEN', 'IN_PROGRESS')
	  AND ($2::bigint = 0 OR c.id = $2)
	  AND ($3::bigint = 0 OR viewer.request_id = $3)
	  AND (
		c.status <> 'CANDIDATE'
		OR NOT EXISTS (
			SELECT 1
			FROM votes AS v
			JOIN chains AS approved_chain ON approved_chain.id = v.chain_id
			JOIN cluster_members AS approved_member ON approved_member.request_id = v.request_id
			JOIN chain_participants AS approved_participant
			  ON approved_participant.chain_id = v.chain_id
			 AND approved_participant.cluster_id = approved_member.cluster_id
			WHERE v.vote = 'approved'
			  AND approved_chain.status NOT IN ('BROKEN', 'COMPLETED')
			  AND approved_participant.cluster_id = viewer.cluster_id
		)
	  )
	ORDER BY c.created_at DESC, c.id DESC
`

// NewRepository создаёт репозиторий цепочек.
func NewRepository(pool *pgxpool.Pool) *Postgres {
	return &Postgres{pool: pool}
}

// SaveCandidates атомарно сохраняет цепочки и участников в уже открытой транзакции.
func (r *Postgres) SaveCandidates(ctx context.Context, tx database.Tx, drafts []entity.ChainDraft) error {
	for _, draft := range drafts {
		if err := saveCandidate(ctx, tx, draft); err != nil {
			return err
		}
	}
	return nil
}

func saveCandidate(ctx context.Context, tx database.Tx, draft entity.ChainDraft) error {
	clusterIDs := make([]int64, len(draft.Participants))
	for i, participant := range draft.Participants {
		clusterIDs[i] = participant.ClusterID
	}
	signature := chainSignature(clusterIDs)

	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, signature); err != nil {
		return fmt.Errorf("lock candidate chain signature: %w", err)
	}

	var exists bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM chains AS c
			WHERE c.status = 'CANDIDATE'
			  AND c.length = $2
			  AND ARRAY(
				SELECT cp.cluster_id
				FROM chain_participants AS cp
				WHERE cp.chain_id = c.id
				ORDER BY cp.position
			  ) = $1::bigint[]
		)
	`, clusterIDs, len(clusterIDs)).Scan(&exists); err != nil {
		return fmt.Errorf("check candidate chain duplicate: %w", err)
	}
	if exists {
		return nil
	}

	var chainID int64
	if err := tx.QueryRow(ctx, `
		INSERT INTO chains (status, score, length)
		VALUES ('CANDIDATE', $1, $2)
		RETURNING id
	`, draft.Score, len(draft.Participants)).Scan(&chainID); err != nil {
		return fmt.Errorf("insert candidate chain: %w", err)
	}

	query, arguments := participantsInsert(chainID, draft.Participants)
	if _, err := tx.Exec(ctx, query, arguments...); err != nil {
		return fmt.Errorf("insert chain participants: %w", err)
	}
	return nil
}

func participantsInsert(chainID int64, participants []entity.ChainDraftParticipant) (string, []any) {
	values := make([]string, 0, len(participants))
	arguments := make([]any, 0, len(participants)*4)
	for position, participant := range participants {
		base := position*4 + 1
		values = append(values, fmt.Sprintf("($%d, $%d, $%d, $%d)", base, base+1, base+2, base+3))
		arguments = append(arguments, chainID, participant.ClusterID, participant.RequestID, position)
	}
	return `
		INSERT INTO chain_participants (chain_id, cluster_id, request_id, position)
		VALUES ` + strings.Join(values, ", "), arguments
}

func chainSignature(clusterIDs []int64) string {
	parts := make([]string, len(clusterIDs))
	for i, clusterID := range clusterIDs {
		parts[i] = strconv.FormatInt(clusterID, 10)
	}
	return strings.Join(parts, ":")
}

// List возвращает актуальные цепочки пользователя без N+1-запросов.
func (r *Postgres) List(ctx context.Context, userID string) ([]entity.Chain, error) {
	chains, err := r.loadVisibleChains(ctx, userID, 0, 0)
	if err != nil || len(chains) == 0 {
		return chains, err
	}
	if err := r.loadParticipants(ctx, chains); err != nil {
		return nil, err
	}
	return chains, nil
}

// ListForOffer возвращает актуальные цепочки конкретной заявки её владельцу.
func (r *Postgres) ListForOffer(ctx context.Context, userID string, offerID int64) ([]entity.Chain, error) {
	var owned bool
	if err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM exchange_offers
			WHERE id = $1
			  AND user_id = $2
			  AND status <> 'REMOVED'
		)
	`, offerID, userID).Scan(&owned); err != nil {
		return nil, fmt.Errorf("verify exchange offer owner: %w", err)
	}
	if !owned {
		return nil, entity.ErrExchangeOfferNotFound
	}

	chains, err := r.loadVisibleChains(ctx, userID, 0, offerID)
	if err != nil || len(chains) == 0 {
		return chains, err
	}
	if err := r.loadParticipants(ctx, chains); err != nil {
		return nil, err
	}
	return chains, nil
}

// Get возвращает актуальную цепочку только её участнику.
func (r *Postgres) Get(ctx context.Context, userID string, chainID int64) (entity.Chain, error) {
	chains, err := r.loadVisibleChains(ctx, userID, chainID, 0)
	if err != nil {
		return entity.Chain{}, err
	}
	if len(chains) == 0 {
		return entity.Chain{}, entity.ErrChainNotFound
	}
	if err := r.loadParticipants(ctx, chains); err != nil {
		return entity.Chain{}, err
	}
	return chains[0], nil
}

func (r *Postgres) loadVisibleChains(ctx context.Context, userID string, chainID, offerID int64) ([]entity.Chain, error) {
	rows, err := r.pool.Query(ctx, loadVisibleChainsQuery, userID, chainID, offerID)
	if err != nil {
		return nil, fmt.Errorf("list visible chains: %w", err)
	}
	defer rows.Close()

	chains := make([]entity.Chain, 0)
	for rows.Next() {
		var chain entity.Chain
		if err := rows.Scan(
			&chain.ID,
			&chain.Status,
			&chain.Score,
			&chain.Length,
			&chain.FreezeDeadlineAt,
			&chain.InvalidReason,
			&chain.Version,
			&chain.CreatedAt,
			&chain.UpdatedAt,
			&chain.CurrentRequestID,
			&chain.CurrentPosition,
		); err != nil {
			return nil, fmt.Errorf("scan visible chain: %w", err)
		}
		chains = append(chains, chain)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate visible chains: %w", err)
	}
	return chains, nil
}

func (r *Postgres) loadParticipants(ctx context.Context, chains []entity.Chain) error {
	chainIDs := make([]int64, len(chains))
	byID := make(map[int64]*entity.Chain, len(chains))
	for i := range chains {
		chainIDs[i] = chains[i].ID
		byID[chains[i].ID] = &chains[i]
		chains[i].Participants = make([]entity.ChainParticipant, 0, chains[i].Length)
	}

	rows, err := r.pool.Query(ctx, `
		SELECT cp.id, cp.chain_id, COALESCE(cp.cluster_id, 0), member.request_id, cp.position,
		       eo.user_id, eo.offered_item_id, i.title, COALESCE(i.description, ''),
		       COALESCE(eo.wanted_description, ''), cp.created_at
		FROM chain_participants AS cp
		JOIN cluster_members AS member ON member.cluster_id = cp.cluster_id
		JOIN exchange_offers AS eo ON eo.id = member.request_id AND eo.status = 'ACTIVE'
		JOIN items AS i ON i.id = eo.offered_item_id
		WHERE cp.chain_id = ANY($1::bigint[])
		ORDER BY cp.chain_id, cp.position, member.request_id
	`, chainIDs)
	if err != nil {
		return fmt.Errorf("load chain participants: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var participant entity.ChainParticipant
		if err := rows.Scan(
			&participant.ID,
			&participant.ChainID,
			&participant.ClusterID,
			&participant.RequestID,
			&participant.Position,
			&participant.OwnerUserID,
			&participant.OfferedItemID,
			&participant.OfferedItemTitle,
			&participant.OfferedItemDescription,
			&participant.WantedDescription,
			&participant.CreatedAt,
		); err != nil {
			return fmt.Errorf("scan chain participant: %w", err)
		}
		if chain := byID[participant.ChainID]; chain != nil {
			chain.Participants = append(chain.Participants, participant)
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate chain participants: %w", err)
	}
	return nil
}

var _ chainservice.Repository = (*Postgres)(nil)
