package chain

import (
	"context"
	"sort"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/database"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/pkg/utils/ranker"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/pkg/validator"
)

const (
	minClusters = 2
	maxClusters = 5
)

// Service сохраняет найденные варианты цепочек и выдаёт доступные пользователю цепочки.
type Service struct {
	repository   Repository
	transactions database.TransactionManager
	scorer       ranker.Ranker
	notifier     Notifier
}

// NewService создаёт сервис цепочек.
func NewService(repository Repository, transactions database.TransactionManager) *Service {
	return &Service{repository: repository, transactions: transactions}
}

// WithScorer подключает пересчёт score при откликах/отзывах.
func (s *Service) WithScorer(scorer ranker.Ranker) *Service {
	s.scorer = scorer
	return s
}

// WithNotifier подключает отправку уведомлений о событиях цепочки.
func (s *Service) WithNotifier(notifier Notifier) *Service {
	s.notifier = notifier
	return s
}

// VoteInput identifies one directed response inside a candidate chain.
type VoteInput struct {
	RequestID       int64 `json:"requestId" validate:"required,gt=0"`
	TargetRequestID int64 `json:"targetRequestId" validate:"required,gt=0,nefield=RequestID"`
}

// SaveCandidates проверяет и сохраняет кандидатные цепочки в переданной транзакции.
func (s *Service) SaveCandidates(ctx context.Context, tx database.Tx, drafts []entity.ChainDraft) error {
	if s.repository == nil {
		return entity.ErrChainRepositoryNotConfigured
	}

	canonical := make([]entity.ChainDraft, 0, len(drafts))
	for _, draft := range drafts {
		normalized, err := normalizeDraft(draft)
		if err != nil {
			return err
		}
		canonical = append(canonical, normalized)
	}
	sort.Slice(canonical, func(i, j int) bool {
		left := canonical[i].Participants
		right := canonical[j].Participants
		for position := 0; position < len(left) && position < len(right); position++ {
			if left[position].ClusterID != right[position].ClusterID {
				return left[position].ClusterID < right[position].ClusterID
			}
		}
		return len(left) < len(right)
	})
	return s.repository.SaveCandidates(ctx, tx, canonical)
}

// List возвращает актуальные цепочки, в которых участвует пользователь.
func (s *Service) List(ctx context.Context, userID string) ([]entity.Chain, error) {
	if s.repository == nil {
		return nil, entity.ErrChainRepositoryNotConfigured
	}
	return s.repository.List(ctx, userID)
}

// ListForOffer возвращает актуальные цепочки конкретной заявки её владельцу.
func (s *Service) ListForOffer(ctx context.Context, userID string, offerID int64) ([]entity.Chain, error) {
	if s.repository == nil {
		return nil, entity.ErrChainRepositoryNotConfigured
	}
	if offerID <= 0 {
		return nil, entity.ErrExchangeOfferNotFound
	}
	return s.repository.ListForOffer(ctx, userID, offerID)
}

// Get возвращает цепочку только тогда, когда пользователь является её участником.
func (s *Service) Get(ctx context.Context, userID string, chainID int64) (entity.Chain, error) {
	if s.repository == nil {
		return entity.Chain{}, entity.ErrChainRepositoryNotConfigured
	}
	return s.repository.Get(ctx, userID, chainID)
}

// Vote records an idempotent response and atomically proposes a chain when the
// approved responses form a closed cycle through every chain position.
func (s *Service) Vote(ctx context.Context, userID string, chainID int64, input VoteInput) (entity.ChainVote, error) {
	if s.repository == nil || s.transactions == nil {
		return entity.ChainVote{}, entity.ErrChainRepositoryNotConfigured
	}
	if chainID <= 0 {
		return entity.ChainVote{}, entity.ErrInvalidVoteTarget
	}
	if err := validator.Validate(&input); err != nil {
		return entity.ChainVote{}, err
	}
	result := entity.ChainVote{
		ChainID:         chainID,
		RequestID:       input.RequestID,
		TargetRequestID: input.TargetRequestID,
		Vote:            entity.VotePending,
	}
	err := s.transactions.WithinTransaction(ctx, func(tx database.Tx) error {
		status, length, err := s.repository.LockForVote(ctx, tx, chainID)
		if err != nil {
			return err
		}
		if status != entity.ChainStatusCandidate {
			existing, getErr := s.repository.GetVote(ctx, tx, userID, chainID, input.RequestID, input.TargetRequestID)
			if getErr == nil && existing.Vote == entity.VotePending {
				result = existing
				result.ChainStatus = status
				return nil
			}
			return entity.ErrChainNotCandidate
		}
		if err := s.repository.ValidateVoteParticipants(
			ctx, tx, userID, chainID, input.RequestID, input.TargetRequestID, length,
		); err != nil {
			return err
		}

		votedAt, err := s.repository.UpsertPendingVote(
			ctx, tx, chainID, input.RequestID, input.TargetRequestID,
		)
		if err != nil {
			return err
		}
		result.VotedAt = votedAt

		if err := s.repository.MarkRequestInProposal(ctx, tx, input.RequestID); err != nil {
			return err
		}
		result.ChainStatus = status

		edges, err := s.repository.ListPendingVoteEdges(ctx, tx, chainID)
		if err != nil {
			return err
		}
		cycle := findPendingCycle(length, edges)
		if len(cycle) == 0 {
			return s.refreshScore(ctx, tx, chainID, entity.ChainStatusCandidate, ranker.EventRespond)
		}
		if err := s.repository.Propose(ctx, tx, chainID, cycle); err != nil {
			return err
		}
		result.ChainStatus = entity.ChainStatusProposed
		return s.refreshScore(ctx, tx, chainID, entity.ChainStatusCandidate, ranker.EventRespond)
	})
	if err != nil {
		return entity.ChainVote{}, err
	}
	if result.ChainStatus == entity.ChainStatusProposed && s.notifier != nil {
		if chain, loadErr := s.repository.Get(ctx, userID, chainID); loadErr == nil {
			_ = s.notifier.NotifyChainProposed(ctx, chainID, chain.Participants)
		}
	}
	return result, nil
}

// WithdrawVote removes a primary response while the chain is still a candidate.
// Deleting an already absent response is intentionally successful.
func (s *Service) WithdrawVote(ctx context.Context, userID string, chainID int64, input VoteInput) error {
	if s.repository == nil || s.transactions == nil {
		return entity.ErrChainRepositoryNotConfigured
	}
	if chainID <= 0 {
		return entity.ErrInvalidVoteTarget
	}
	if err := validator.Validate(&input); err != nil {
		return err
	}

	return s.transactions.WithinTransaction(ctx, func(tx database.Tx) error {
		status, length, err := s.repository.LockForVote(ctx, tx, chainID)
		if err != nil {
			return err
		}
		if status != entity.ChainStatusCandidate {
			return entity.ErrChainNotCandidate
		}
		if err := s.repository.ValidateVoteParticipants(
			ctx, tx, userID, chainID, input.RequestID, input.TargetRequestID, length,
		); err != nil {
			return err
		}
		if err := s.repository.DeletePendingVote(ctx, tx, chainID, input.RequestID, input.TargetRequestID); err != nil {
			return err
		}
		if err := s.repository.RestoreActiveIfNoPendingVotes(ctx, tx, input.RequestID); err != nil {
			return err
		}
		return s.refreshScore(ctx, tx, chainID, entity.ChainStatusCandidate, ranker.EventDecline)
	})
}

func findPendingCycle(length int, edges []entity.VoteEdge) []int64 {
	if length < minClusters || length > maxClusters {
		return nil
	}

	bySource := make(map[int64][]int64)
	starts := make([]int64, 0)
	for _, edge := range edges {
		bySource[edge.RequestID] = append(bySource[edge.RequestID], edge.TargetRequestID)
		if edge.Position == 0 {
			starts = append(starts, edge.RequestID)
		}
	}
	sort.Slice(starts, func(i, j int) bool { return starts[i] < starts[j] })
	for source := range bySource {
		sort.Slice(bySource[source], func(i, j int) bool {
			return bySource[source][i] < bySource[source][j]
		})
	}

	for _, start := range starts {
		path := []int64{start}
		if findCyclePath(start, start, length, bySource, &path) {
			return path
		}
	}
	return nil
}

func findCyclePath(start, current int64, length int, bySource map[int64][]int64, path *[]int64) bool {
	if len(*path) == length {
		for _, target := range bySource[current] {
			if target == start {
				return true
			}
		}
		return false
	}

	for _, target := range bySource[current] {
		if containsRequest(*path, target) {
			continue
		}
		*path = append(*path, target)
		if findCyclePath(start, target, length, bySource, path) {
			return true
		}
		*path = (*path)[:len(*path)-1]
	}
	return false
}

func containsRequest(requestIDs []int64, target int64) bool {
	for _, requestID := range requestIDs {
		if requestID == target {
			return true
		}
	}
	return false
}

func normalizeDraft(draft entity.ChainDraft) (entity.ChainDraft, error) {
	length := len(draft.Participants)
	if length < minClusters || length > maxClusters || draft.Score < 0 || draft.Score > 1 {
		return entity.ChainDraft{}, entity.ErrInvalidChainDraft
	}

	seenClusters := make(map[int64]struct{}, length)
	seenRequests := make(map[int64]struct{}, length)
	minimumPosition := 0
	for position, participant := range draft.Participants {
		if participant.ClusterID <= 0 || participant.RequestID <= 0 {
			return entity.ChainDraft{}, entity.ErrInvalidChainDraft
		}
		if _, exists := seenClusters[participant.ClusterID]; exists {
			return entity.ChainDraft{}, entity.ErrInvalidChainDraft
		}
		seenClusters[participant.ClusterID] = struct{}{}
		if _, exists := seenRequests[participant.RequestID]; exists {
			return entity.ChainDraft{}, entity.ErrInvalidChainDraft
		}
		seenRequests[participant.RequestID] = struct{}{}
		if participant.ClusterID < draft.Participants[minimumPosition].ClusterID {
			minimumPosition = position
		}
	}

	participants := make([]entity.ChainDraftParticipant, 0, length)
	participants = append(participants, draft.Participants[minimumPosition:]...)
	participants = append(participants, draft.Participants[:minimumPosition]...)
	return entity.ChainDraft{
		Participants:           participants,
		Score:                  draft.Score,
		ClusterSizes:           rotRightInt(draft.ClusterSizes, minimumPosition),
		EdgeCosines:            rotRightFloat(draft.EdgeCosines, minimumPosition),
		ParticipantReliability: rotRightFloat(draft.ParticipantReliability, minimumPosition),
	}, nil
}

func (s *Service) refreshScore(ctx context.Context, tx database.Tx, chainID int64, stage entity.ChainStatus, event ranker.StateEvent) error {
	if s.scorer == nil {
		return nil
	}
	cosines, reliability, sizes, err := s.repository.LoadScoreFeatures(ctx, tx, chainID)
	if err != nil {
		return err
	}
	approved, err := s.repository.CountPendingVoters(ctx, tx, chainID)
	if err != nil {
		return err
	}
	score, err := s.scorer.Score(ranker.ChainState{
		Count:                   len(cosines),
		Stage:                   scoreStage(stage),
		Event:                   event,
		EdgeCosines:             cosines,
		ParticipantReliability:  reliability,
		ParticipantClusterSizes: sizes,
		ApprovedVotes:           approved,
	})
	if err != nil {
		return err
	}
	return s.repository.UpdateScore(ctx, tx, chainID, score)
}

func rotRightInt(values []int, n int) []int {
	if len(values) == 0 {
		return values
	}
	n = n % len(values)
	rotated := make([]int, 0, len(values))
	rotated = append(rotated, values[n:]...)
	rotated = append(rotated, values[:n]...)
	return rotated
}

func rotRightFloat(values []float64, n int) []float64 {
	if len(values) == 0 {
		return values
	}
	n = n % len(values)
	rotated := make([]float64, 0, len(values))
	rotated = append(rotated, values[n:]...)
	rotated = append(rotated, values[:n]...)
	return rotated
}

func scoreStage(status entity.ChainStatus) ranker.ChainStateStatus {
	switch status {
	case entity.ChainStatusProposed:
		return ranker.ChainStateProposed
	case entity.ChainStatusFrozen:
		return ranker.ChainStateFrozen
	case entity.ChainStatusInProgress:
		return ranker.ChainStateInProgress
	case entity.ChainStatusCompleted:
		return ranker.ChainStateCompleted
	case entity.ChainStatusBroken:
		return ranker.ChainStateBroken
	default:
		return ranker.ChainStateCandidate
	}
}
