package chain

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
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
		  AND (c.status = 'CANDIDATE' OR member.request_id = cp.request_id)
		  AND eo.user_id = $1
		  AND eo.status = 'ACTIVE'
		ORDER BY cp.position
		LIMIT 1
	) AS viewer ON true
	WHERE c.status IN ('CANDIDATE', 'PROPOSED', 'FROZEN', 'IN_PROGRESS')
		AND ($2::bigint = 0 OR c.id = $2)
		AND ($3::bigint = 0 OR viewer.request_id = $3)
		AND ($2::bigint <> 0 OR c.status <> 'FROZEN')
		AND NOT EXISTS (
		SELECT 1
		FROM cluster_members AS veto
		JOIN votes AS vv
			ON vv.chain_id = c.id
			AND vv.request_id = veto.request_id
		WHERE veto.cluster_id = viewer.cluster_id
			AND vv.vote = 'approved'
		)
	ORDER BY c.created_at DESC, c.id DESC
`

const validateVoteSourceQuery = `
	SELECT cp.position
	FROM exchange_offers AS source
	JOIN cluster_members AS member ON member.request_id = source.id
	JOIN chain_participants AS cp ON cp.cluster_id = member.cluster_id
	WHERE cp.chain_id = $1
	  AND source.id = $2
	  AND source.user_id = $3
	  AND source.status = 'ACTIVE'
`

const validateVoteTargetQuery = `
	SELECT cp.position
	FROM exchange_offers AS target
	JOIN cluster_members AS member ON member.request_id = target.id
	JOIN chain_participants AS cp ON cp.cluster_id = member.cluster_id
	WHERE cp.chain_id = $1
	  AND target.id = $2
	  AND target.status = 'ACTIVE'
`

const listPendingVoteEdgesQuery = `
	SELECT vote.request_id, vote.target_request_id, source_participant.position
	FROM votes AS vote
	JOIN cluster_members AS source_member ON source_member.request_id = vote.request_id
	JOIN chain_participants AS source_participant
	  ON source_participant.chain_id = vote.chain_id
	 AND source_participant.cluster_id = source_member.cluster_id
	WHERE vote.chain_id = $1
	  AND vote.vote = 'pending'
	ORDER BY source_participant.position, vote.request_id, vote.target_request_id
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

	query, arguments := participantsInsert(chainID, draft)
	if _, err := tx.Exec(ctx, query, arguments...); err != nil {
		return fmt.Errorf("insert chain participants: %w", err)
	}
	return nil
}

func participantsInsert(chainID int64, draft entity.ChainDraft) (string, []any) {
	participants := draft.Participants
	values := make([]string, 0, len(participants))
	arguments := make([]any, 0, len(participants)*7)
	for position, participant := range participants {
		base := position*7 + 1
		values = append(values, fmt.Sprintf(
			"($%d, $%d, $%d, $%d, $%d, $%d, $%d)",
			base, base+1, base+2, base+3, base+4, base+5, base+6,
		))
		arguments = append(arguments,
			chainID,
			participant.ClusterID,
			participant.RequestID,
			position,
			edgeCosineAt(draft, position),
			reliabilityAt(draft, position),
			clusterSizeAt(draft, position),
		)
	}
	return `
		INSERT INTO chain_participants (
			chain_id, cluster_id, request_id, position,
			edge_cosine, reliability, cluster_size
		)
		VALUES ` + strings.Join(values, ", "), arguments
}

func edgeCosineAt(draft entity.ChainDraft, position int) float64 {
	if position < len(draft.EdgeCosines) {
		return draft.EdgeCosines[position]
	}
	return 0
}

func reliabilityAt(draft entity.ChainDraft, position int) float64 {
	if position < len(draft.ParticipantReliability) {
		return draft.ParticipantReliability[position]
	}
	return 0.75
}

func clusterSizeAt(draft entity.ChainDraft, position int) int {
	if position < len(draft.ClusterSizes) {
		return draft.ClusterSizes[position]
	}
	return 1
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

// LockForVote serializes all responses for one chain and returns its current state.
func (r *Postgres) LockForVote(
	ctx context.Context,
	tx database.Tx,
	chainID int64,
) (entity.ChainStatus, int, error) {
	var status entity.ChainStatus
	var length int
	err := tx.QueryRow(ctx, `
		SELECT status, length
		FROM chains
		WHERE id = $1
		FOR UPDATE
	`, chainID).Scan(&status, &length)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", 0, entity.ErrChainNotFound
	}
	if err != nil {
		return "", 0, fmt.Errorf("lock chain for vote: %w", err)
	}
	return status, length, nil
}

// ValidateVoteParticipants verifies ownership and the directed edge between
// adjacent chain positions while the chain row is locked by the caller.
func (r *Postgres) ValidateVoteParticipants(
	ctx context.Context,
	tx database.Tx,
	userID string,
	chainID, requestID, targetRequestID int64,
	chainLength int,
) error {
	var sourcePosition int
	err := tx.QueryRow(ctx, validateVoteSourceQuery, chainID, requestID, userID).Scan(&sourcePosition)
	if errors.Is(err, pgx.ErrNoRows) {
		return entity.ErrChainVoteForbidden
	}
	if err != nil {
		return fmt.Errorf("validate vote source: %w", err)
	}

	var targetPosition int
	err = tx.QueryRow(ctx, validateVoteTargetQuery, chainID, targetRequestID).Scan(&targetPosition)
	if errors.Is(err, pgx.ErrNoRows) {
		return entity.ErrInvalidVoteTarget
	}
	if err != nil {
		return fmt.Errorf("validate vote target: %w", err)
	}
	if chainLength <= 0 || targetPosition != (sourcePosition+1)%chainLength {
		return entity.ErrInvalidVoteTarget
	}
	return nil
}

// GetVote returns an existing response only when the source request belongs to
// the authenticated user. It is used to make retries idempotent after proposal.
func (r *Postgres) GetVote(
	ctx context.Context,
	tx database.Tx,
	userID string,
	chainID, requestID, targetRequestID int64,
) (entity.ChainVote, error) {
	vote := entity.ChainVote{
		ChainID:         chainID,
		RequestID:       requestID,
		TargetRequestID: targetRequestID,
	}
	err := tx.QueryRow(ctx, `
		SELECT vote.vote, vote.voted_at
		FROM votes AS vote
		JOIN exchange_offers AS source ON source.id = vote.request_id
		WHERE vote.chain_id = $1
		  AND vote.request_id = $2
		  AND vote.target_request_id = $3
		  AND source.user_id = $4
	`, chainID, requestID, targetRequestID, userID).Scan(&vote.Vote, &vote.VotedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return entity.ChainVote{}, entity.ErrChainVoteForbidden
	}
	if err != nil {
		return entity.ChainVote{}, fmt.Errorf("get chain vote: %w", err)
	}
	return vote, nil
}

// UpsertPendingVote records a candidate response without creating duplicates.
func (r *Postgres) UpsertPendingVote(
	ctx context.Context,
	tx database.Tx,
	chainID, requestID, targetRequestID int64,
) (time.Time, error) {
	var votedAt time.Time
	err := tx.QueryRow(ctx, `
		INSERT INTO votes (chain_id, request_id, target_request_id, vote, voted_at)
		VALUES ($1, $2, $3, 'pending', NOW())
		ON CONFLICT ON CONSTRAINT votes_chain_request_target_key
		DO UPDATE SET
			vote = 'pending',
			voted_at = votes.voted_at
		RETURNING voted_at
	`, chainID, requestID, targetRequestID).Scan(&votedAt)
	if err != nil {
		return time.Time{}, fmt.Errorf("upsert chain vote: %w", err)
	}
	return votedAt, nil
}

// DeletePendingVote withdraws only a candidate-stage response. A missing row
// is not an error, which makes retries idempotent.
func (r *Postgres) DeletePendingVote(
	ctx context.Context,
	tx database.Tx,
	chainID, requestID, targetRequestID int64,
) error {
	_, err := tx.Exec(ctx, `
		DELETE FROM votes
		WHERE chain_id = $1
		  AND request_id = $2
		  AND target_request_id = $3
		  AND vote = 'pending'
	`, chainID, requestID, targetRequestID)
	if err != nil {
		return fmt.Errorf("delete pending chain vote: %w", err)
	}
	return nil
}

// ListPendingVoteEdges returns candidate responses for the service's local DFS.
func (r *Postgres) ListPendingVoteEdges(
	ctx context.Context,
	tx database.Tx,
	chainID int64,
) ([]entity.VoteEdge, error) {
	rows, err := tx.Query(ctx, listPendingVoteEdgesQuery, chainID)
	if err != nil {
		return nil, fmt.Errorf("list pending vote edges: %w", err)
	}
	defer rows.Close()

	edges := make([]entity.VoteEdge, 0)
	for rows.Next() {
		var edge entity.VoteEdge
		if err := rows.Scan(&edge.RequestID, &edge.TargetRequestID, &edge.Position); err != nil {
			return nil, fmt.Errorf("scan pending vote edge: %w", err)
		}
		edges = append(edges, edge)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate pending vote edges: %w", err)
	}
	return edges, nil
}

// Propose pins the concrete requests selected by DFS, locks them into
// IN_PROPOSAL, and resets votes to pending while the chain is a candidate.
func (r *Postgres) Propose(
	ctx context.Context,
	tx database.Tx,
	chainID int64,
	requestIDsByPosition []int64,
) error {
	for position, requestID := range requestIDsByPosition {
		result, err := tx.Exec(ctx, `
			UPDATE chain_participants
			SET request_id = $3
			WHERE chain_id = $1
			  AND position = $2
		`, chainID, position, requestID)
		if err != nil {
			return fmt.Errorf("pin chain participant at position %d: %w", position, err)
		}
		if result.RowsAffected() != 1 {
			return fmt.Errorf("pin chain participant at position %d: %w", position, entity.ErrInvalidVoteTarget)
		}
	}

	result, err := tx.Exec(ctx, `
		UPDATE chains
		SET status = 'PROPOSED',
		    version = version + 1,
		    updated_at = NOW()
		WHERE id = $1
		  AND status = 'CANDIDATE'
	`, chainID)
	if err != nil {
		return fmt.Errorf("propose chain: %w", err)
	}
	if result.RowsAffected() != 1 {
		return entity.ErrChainNotCandidate
	}

	if _, err := tx.Exec(ctx, `
		UPDATE exchange_offers
		SET status = 'IN_PROPOSAL', updated_at = NOW()
		WHERE id = ANY($1::bigint[])
		  AND status IN ('ACTIVE', 'IN_PROPOSAL')
	`, requestIDsByPosition); err != nil {
		return fmt.Errorf("lock proposed requests: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		UPDATE votes
		SET vote = 'pending', voted_at = NOW()
		WHERE chain_id = $1
		  AND vote <> 'pending'
	`, chainID); err != nil {
		return fmt.Errorf("reset votes to pending: %w", err)
	}

	return nil
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
		       COALESCE(eo.wanted_description, ''), cp.created_at,
		       i.image_url
		FROM chain_participants AS cp
		JOIN chains AS c ON c.id = cp.chain_id
		JOIN cluster_members AS member ON member.cluster_id = cp.cluster_id
		JOIN exchange_offers AS eo ON eo.id = member.request_id AND eo.status = 'ACTIVE'
		JOIN items AS i ON i.id = eo.offered_item_id
		WHERE cp.chain_id = ANY($1::bigint[])
		  AND (c.status = 'CANDIDATE' OR member.request_id = cp.request_id)
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
			&participant.ImageURL,
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
	rows.Close()
	return r.loadViewerVotes(ctx, chains)
}

func (r *Postgres) loadViewerVotes(ctx context.Context, chains []entity.Chain) error {
	chainIDs := make([]int64, len(chains))
	byID := make(map[int64]*entity.Chain, len(chains))
	for i := range chains {
		chainIDs[i] = chains[i].ID
		byID[chains[i].ID] = &chains[i]
	}

	rows, err := r.pool.Query(ctx, `
		SELECT chain_id, request_id, target_request_id, vote
		FROM votes
		WHERE chain_id = ANY($1::bigint[])
	`, chainIDs)
	if err != nil {
		return fmt.Errorf("load viewer votes: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var chainID, requestID, targetRequestID int64
		var vote entity.VoteValue
		if err := rows.Scan(&chainID, &requestID, &targetRequestID, &vote); err != nil {
			return fmt.Errorf("scan viewer vote: %w", err)
		}
		chain := byID[chainID]
		if chain == nil || chain.CurrentRequestID != requestID {
			continue
		}
		for i := range chain.Participants {
			if chain.Participants[i].RequestID == targetRequestID {
				chain.Participants[i].Vote = &vote
				break
			}
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate viewer votes: %w", err)
	}
	return nil
}

// MarkRequestInProposal переводит откликнувшуюся заявку в мягкую блокировку.
func (r *Postgres) MarkRequestInProposal(ctx context.Context, tx database.Tx, requestID int64) error {
	if _, err := tx.Exec(ctx, `
		UPDATE exchange_offers
		SET status = 'IN_PROPOSAL', updated_at = NOW()
		WHERE id = $1 AND status IN ('ACTIVE', 'IN_PROPOSAL')
	`, requestID); err != nil {
		return fmt.Errorf("mark request in proposal: %w", err)
	}
	return nil
}

// RestoreActiveIfNoPendingVotes возвращает заявку в ACTIVE, когда у неё не
// осталось других pending-голосов как откликнувшейся.
func (r *Postgres) RestoreActiveIfNoPendingVotes(ctx context.Context, tx database.Tx, requestID int64) error {
	if _, err := tx.Exec(ctx, `
		UPDATE exchange_offers AS eo
		SET status = 'ACTIVE', updated_at = NOW()
		WHERE eo.id = $1
		  AND eo.status = 'IN_PROPOSAL'
		  AND NOT EXISTS (
			SELECT 1 FROM votes AS v
			WHERE v.request_id = eo.id AND v.vote = 'pending'
		  )
	`, requestID); err != nil {
		return fmt.Errorf("restore request active: %w", err)
	}
	return nil
}

// LoadScoreFeatures возвращает сырые фичи score по позициям цепочки.
func (r *Postgres) LoadScoreFeatures(
	ctx context.Context, tx database.Tx, chainID int64,
) ([]float64, []float64, []int, error) {
	rows, err := tx.Query(ctx, `
		SELECT COALESCE(edge_cosine, 0), COALESCE(reliability, 0), COALESCE(cluster_size, 1)
		FROM chain_participants
		WHERE chain_id = $1
		ORDER BY position
	`, chainID)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("load score features: %w", err)
	}
	defer rows.Close()

	var cosines []float64
	var reliability []float64
	var sizes []int
	for rows.Next() {
		var c, rel float64
		var size int
		if err := rows.Scan(&c, &rel, &size); err != nil {
			return nil, nil, nil, fmt.Errorf("scan score feature: %w", err)
		}
		cosines = append(cosines, c)
		reliability = append(reliability, rel)
		sizes = append(sizes, size)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, nil, fmt.Errorf("iterate score features: %w", err)
	}
	return cosines, reliability, sizes, nil
}

// CountPendingVoters возвращает число откликнувшихся участников цепочки.
func (r *Postgres) CountPendingVoters(ctx context.Context, tx database.Tx, chainID int64) (int, error) {
	var count int
	if err := tx.QueryRow(ctx, `
		SELECT COUNT(DISTINCT request_id)
		FROM votes
		WHERE chain_id = $1 AND vote = 'pending'
	`, chainID).Scan(&count); err != nil {
		return 0, fmt.Errorf("count pending voters: %w", err)
	}
	return count, nil
}

// UpdateScore актуализирует score цепочки, сохраняя оптимистичную блокировку.
func (r *Postgres) UpdateScore(ctx context.Context, tx database.Tx, chainID int64, score float64) error {
	if _, err := tx.Exec(ctx, `
		UPDATE chains
		SET score = $2, version = version + 1, updated_at = NOW()
		WHERE id = $1
	`, chainID, score); err != nil {
		return fmt.Errorf("update chain score: %w", err)
	}
	return nil
}

// ConfirmParticipant помечает голос участника как approved (идемпотентно).
func (r *Postgres) ConfirmParticipant(ctx context.Context, tx database.Tx, chainID, requestID, targetRequestID int64) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO votes (chain_id, request_id, target_request_id, vote, voted_at)
		VALUES ($1, $2, $3, 'approved', NOW())
		ON CONFLICT ON CONSTRAINT votes_chain_request_target_key
		DO UPDATE SET vote = 'approved', voted_at = NOW()
	`, chainID, requestID, targetRequestID)
	if err != nil {
		return fmt.Errorf("confirm participant vote: %w", err)
	}
	return nil
}

// CountApprovedVoters возвращает число участников цепочки, подтвердивших участие.
func (r *Postgres) CountApprovedVoters(ctx context.Context, tx database.Tx, chainID int64) (int, error) {
	var count int
	if err := tx.QueryRow(ctx, `
		SELECT COUNT(DISTINCT request_id)
		FROM votes
		WHERE chain_id = $1 AND vote = 'approved'
	`, chainID).Scan(&count); err != nil {
		return 0, fmt.Errorf("count approved voters: %w", err)
	}
	return count, nil
}

// MarkRequestLocked переводит заявку в жёсткую блокировку.
func (r *Postgres) MarkRequestLocked(ctx context.Context, tx database.Tx, requestID int64) error {
	if _, err := tx.Exec(ctx, `
		UPDATE exchange_offers
		SET status = 'LOCKED', updated_at = NOW()
		WHERE id = $1 AND status IN ('IN_PROPOSAL', 'ACTIVE', 'LOCKED')
	`, requestID); err != nil {
		return fmt.Errorf("mark request locked: %w", err)
	}
	return nil
}

// FreezeChain переводит цепочку в FROZEN с дедлайном и оптимистичной версией.
func (r *Postgres) FreezeChain(ctx context.Context, tx database.Tx, chainID int64, deadline time.Time) error {
	result, err := tx.Exec(ctx, `
		UPDATE chains
		SET status = 'FROZEN',
		    freeze_deadline_at = $2,
		    version = version + 1,
		    updated_at = NOW()
		WHERE id = $1 AND status = 'PROPOSED'
	`, chainID, deadline)
	if err != nil {
		return fmt.Errorf("freeze chain: %w", err)
	}
	if result.RowsAffected() != 1 {
		return entity.ErrChainNotProposed
	}
	return nil
}

// LockRequestsInChain переводит все заявки цепочки в LOCKED.
func (r *Postgres) LockRequestsInChain(ctx context.Context, tx database.Tx, chainID int64) error {
	if _, err := tx.Exec(ctx, `
		UPDATE exchange_offers AS eo
		SET status = 'LOCKED', updated_at = NOW()
		WHERE eo.id IN (
			SELECT member.request_id
			FROM chain_participants AS cp
			JOIN cluster_members AS member ON member.cluster_id = cp.cluster_id
			WHERE cp.chain_id = $1
		)
		  AND eo.status IN ('IN_PROPOSAL', 'ACTIVE')
	`, chainID); err != nil {
		return fmt.Errorf("lock requests in chain: %w", err)
	}
	return nil
}

// MarkItemsUnavailable переводит предлагаемые товары участников в UNAVAILABLE.
func (r *Postgres) MarkItemsUnavailable(ctx context.Context, tx database.Tx, chainID int64) error {
	if _, err := tx.Exec(ctx, `
		UPDATE items AS i
		SET status = 'UNAVAILABLE', updated_at = NOW()
		WHERE i.id IN (
			SELECT eo.offered_item_id
			FROM chain_participants AS cp
			JOIN cluster_members AS member ON member.cluster_id = cp.cluster_id
			JOIN exchange_offers AS eo ON eo.id = member.request_id
			WHERE cp.chain_id = $1
		)
	`, chainID); err != nil {
		return fmt.Errorf("mark items unavailable: %w", err)
	}
	return nil
}

// LoadChainRequestIDs возвращает заявки участников цепочки.
func (r *Postgres) LoadChainRequestIDs(ctx context.Context, tx database.Tx, chainID int64) ([]int64, error) {
	rows, err := tx.Query(ctx, `
		SELECT DISTINCT member.request_id
		FROM chain_participants AS cp
		JOIN cluster_members AS member ON member.cluster_id = cp.cluster_id
		WHERE cp.chain_id = $1
	`, chainID)
	if err != nil {
		return nil, fmt.Errorf("load chain request ids: %w", err)
	}
	defer rows.Close()

	ids := make([]int64, 0)
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan chain request id: %w", err)
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate chain request ids: %w", err)
	}
	return ids, nil
}

// LoadRequestLiveChainStatus вернёт FROZEN, если заявка уже сидит в замороженной цепочке.
func (r *Postgres) LoadRequestLiveChainStatus(ctx context.Context, tx database.Tx, requestID int64) (entity.ChainStatus, error) {
	var status entity.ChainStatus
	err := tx.QueryRow(ctx, `
		SELECT c.status
		FROM chain_participants AS cp
		JOIN chains AS c ON c.id = cp.chain_id
		JOIN cluster_members AS member ON member.cluster_id = cp.cluster_id
		WHERE member.request_id = $1
		ORDER BY CASE WHEN c.status = 'FROZEN' THEN 0 ELSE 1 END
		LIMIT 1
	`, requestID).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return entity.ChainStatusCandidate, nil
	}
	if err != nil {
		return entity.ChainStatus(""), fmt.Errorf("load request live chain status: %w", err)
	}
	return status, nil
}

// FindParticipantEdge находит голос (request→target) участника в цепочке по userID.
func (r *Postgres) FindParticipantEdge(ctx context.Context, tx database.Tx, chainID int64, userID string) (int64, int64, error) {
	var requestID, targetID int64
	err := tx.QueryRow(ctx, `
		SELECT vote.request_id, vote.target_request_id
		FROM votes AS vote
		JOIN exchange_offers AS source ON source.id = vote.request_id
		WHERE vote.chain_id = $1
		  AND source.user_id = $2
		  AND vote.vote IN ('pending', 'approved')
		ORDER BY source.id
		LIMIT 1
	`, chainID, userID).Scan(&requestID, &targetID)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, 0, entity.ErrChainVoteForbidden
	}
	if err != nil {
		return 0, 0, fmt.Errorf("find participant edge: %w", err)
	}
	return requestID, targetID, nil
}


// ListChainsContainingRequest возвращает цепочки, где заявка участвует как представитель.
func (r *Postgres) ListChainsContainingRequest(ctx context.Context, tx database.Tx, requestID int64) ([]int64, error) {
	rows, err := tx.Query(ctx, `
		SELECT DISTINCT cp.chain_id
		FROM chain_participants AS cp
		WHERE cp.request_id = $1
	`, requestID)
	if err != nil {
		return nil, fmt.Errorf("list chains containing request: %w", err)
	}
	defer rows.Close()

	ids := make([]int64, 0)
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan affected chain id: %w", err)
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate affected chain ids: %w", err)
	}
	return ids, nil
}

// DeleteChain удаляет цепочку целиком каскадом: голоса, участники, саму цепочку.
func (r *Postgres) DeleteChain(ctx context.Context, tx database.Tx, chainID int64) error {
	if _, err := tx.Exec(ctx, `DELETE FROM votes WHERE chain_id = $1`, chainID); err != nil {
		return fmt.Errorf("delete chain votes: %w", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM chain_participants WHERE chain_id = $1`, chainID); err != nil {
		return fmt.Errorf("delete chain participants: %w", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM chains WHERE id = $1`, chainID); err != nil {
		return fmt.Errorf("delete chain: %w", err)
	}
	return nil
}

// DeleteRequestParticipation удаляет только участие заявки в цепочках и её голоса,
// не трогая сами цепочки (их последующей пересборкой занимается matcher).
func (r *Postgres) DeleteRequestParticipation(ctx context.Context, tx database.Tx, requestID int64) error {
	if _, err := tx.Exec(ctx, `
		DELETE FROM votes WHERE request_id = $1 OR target_request_id = $1
	`, requestID); err != nil {
		return fmt.Errorf("delete request votes: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		DELETE FROM chain_participants WHERE request_id = $1
	`, requestID); err != nil {
		return fmt.Errorf("delete request chain participation: %w", err)
	}
	return nil
}

// ReleaseCompetitorsFromOtherChains вычёркивает участников замороженной цепочки
// из конкурирующих цепочек (удаляет их голоса и chain_participants) и возвращает
// chainID конкурирующих цепочек, где остались участники (нужно пересобрать).
// Сама замороженная цепочка chainID НЕ трогается.
func (r *Postgres) ReleaseCompetitorsFromOtherChains(ctx context.Context, tx database.Tx, chainID int64) ([]int64, error) {
	// Удаляем голоса замороженных участников в других цепочках.
	if _, err := tx.Exec(ctx, `
		DELETE FROM votes AS v
		WHERE v.chain_id <> $1
		  AND EXISTS (
			SELECT 1
			FROM chain_participants AS cp
			JOIN cluster_members AS member ON member.cluster_id = cp.cluster_id
			WHERE cp.chain_id = $1
			  AND member.request_id = v.request_id
		  )
	`, chainID); err != nil {
		return nil, fmt.Errorf("delete competitor votes: %w", err)
	}

	// Запоминаем, какие конкурирующие цепочки затронуты (до удаления участников).
	affected, err := func() ([]int64, error) {
		rows, err := tx.Query(ctx, `
			SELECT DISTINCT cp_outside.chain_id
			FROM chain_participants AS cp_outside
			JOIN cluster_members AS member ON member.cluster_id = cp_outside.cluster_id
			JOIN chain_participants AS frozen ON frozen.chain_id = $1
			WHERE cp_outside.chain_id <> $1
			  AND member.request_id = frozen.request_id
		`, chainID)
		if err != nil {
			return nil, fmt.Errorf("list affected competitor chains: %w", err)
		}
		defer rows.Close()
		ids := make([]int64, 0)
		for rows.Next() {
			var id int64
			if err := rows.Scan(&id); err != nil {
				return nil, fmt.Errorf("scan affected chain id: %w", err)
			}
			ids = append(ids, id)
		}
		if err := rows.Err(); err != nil {
			return nil, fmt.Errorf("iterate affected chain ids: %w", err)
		}
		return ids, nil
	}()
	if err != nil {
		return nil, err
	}

	// Убираем вхождения замороженных участников из конкурирующих цепочек.
	if _, err := tx.Exec(ctx, `
		DELETE FROM chain_participants AS cp
		WHERE cp.chain_id <> $1
		  AND EXISTS (
			SELECT 1
			FROM cluster_members AS member
			JOIN chain_participants AS frozen ON frozen.chain_id = $1
			WHERE member.cluster_id = cp.cluster_id
			  AND member.request_id = frozen.request_id
		  )
	`, chainID); err != nil {
		return nil, fmt.Errorf("remove frozen participants from competitor chains: %w", err)
	}

	return affected, nil
}


var _ chainservice.Repository = (*Postgres)(nil)
