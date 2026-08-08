package chain_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/database"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	chainservice "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/chain"
)

func TestSaveCandidatesCanonicalizesCycleRotation(t *testing.T) {
	repository := &fakeRepository{}
	service := chainservice.NewService(repository, fakeTransactionManager{})
	draft := entity.ChainDraft{
		Score: 0.9,
		Participants: []entity.ChainDraftParticipant{
			{ClusterID: 30, RequestID: 1},
			{ClusterID: 10, RequestID: 99},
			{ClusterID: 20, RequestID: 2},
		},
	}

	if err := service.SaveCandidates(context.Background(), nil, []entity.ChainDraft{draft}); err != nil {
		t.Fatalf("SaveCandidates() error = %v", err)
	}
	want := []int64{10, 20, 30}
	for i, clusterID := range want {
		if got := repository.saved[0].Participants[i].ClusterID; got != clusterID {
			t.Fatalf("participant %d cluster = %d, want %d", i, got, clusterID)
		}
	}
}

func TestSaveCandidatesRejectsRepeatedCluster(t *testing.T) {
	tests := []struct {
		name         string
		participants []entity.ChainDraftParticipant
	}{
		{
			name: "cluster",
			participants: []entity.ChainDraftParticipant{
				{ClusterID: 1, RequestID: 1},
				{ClusterID: 1, RequestID: 2},
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			repository := &fakeRepository{}
			service := chainservice.NewService(repository, fakeTransactionManager{})
			err := service.SaveCandidates(context.Background(), nil, []entity.ChainDraft{{
				Score:        0.8,
				Participants: test.participants,
			}})
			if !errors.Is(err, entity.ErrInvalidChainDraft) {
				t.Fatalf("SaveCandidates() error = %v", err)
			}
			if len(repository.saved) != 0 {
				t.Fatal("invalid draft must not be saved")
			}
		})
	}
}

func TestSaveCandidatesAllowsOneClusterInDifferentChains(t *testing.T) {
	repository := &fakeRepository{}
	service := chainservice.NewService(repository, fakeTransactionManager{})
	drafts := []entity.ChainDraft{
		{
			Score: 0.9,
			Participants: []entity.ChainDraftParticipant{
				{ClusterID: 1, RequestID: 1},
				{ClusterID: 2, RequestID: 2},
			},
		},
		{
			Score: 0.8,
			Participants: []entity.ChainDraftParticipant{
				{ClusterID: 1, RequestID: 1},
				{ClusterID: 3, RequestID: 3},
			},
		},
	}

	if err := service.SaveCandidates(context.Background(), nil, drafts); err != nil {
		t.Fatalf("SaveCandidates() error = %v", err)
	}
	if len(repository.saved) != 2 {
		t.Fatalf("saved drafts = %d, want 2", len(repository.saved))
	}
}

type fakeRepository struct {
	saved         []entity.ChainDraft
	status        entity.ChainStatus
	length        int
	edges         []entity.VoteEdge
	existingVote  entity.ChainVote
	proposed      []int64
	upsertCalls   int
	deleteCalls   int
	validationErr error
}

func (r *fakeRepository) SaveCandidates(_ context.Context, _ database.Tx, drafts []entity.ChainDraft) error {
	r.saved = append(r.saved, drafts...)
	return nil
}

func (r *fakeRepository) List(_ context.Context, _ string) ([]entity.Chain, error) {
	return []entity.Chain{}, nil
}

func (r *fakeRepository) ListForOffer(_ context.Context, _ string, _ int64) ([]entity.Chain, error) {
	return []entity.Chain{}, nil
}

func (r *fakeRepository) Get(_ context.Context, _ string, _ int64) (entity.Chain, error) {
	return entity.Chain{}, nil
}

func (r *fakeRepository) LockForVote(_ context.Context, _ database.Tx, _ int64) (entity.ChainStatus, int, error) {
	status := r.status
	if status == "" {
		status = entity.ChainStatusCandidate
	}
	return status, r.length, nil
}

func (r *fakeRepository) ValidateVoteParticipants(_ context.Context, _ database.Tx, _ string, _, _, _ int64, _ int) error {
	return r.validationErr
}

func (r *fakeRepository) GetVote(_ context.Context, _ database.Tx, _ string, _, _, _ int64) (entity.ChainVote, error) {
	return r.existingVote, nil
}

func (r *fakeRepository) UpsertPendingVote(_ context.Context, _ database.Tx, _, _, _ int64) (time.Time, error) {
	r.upsertCalls++
	return time.Date(2026, 8, 8, 12, 0, 0, 0, time.UTC), nil
}

func (r *fakeRepository) DeletePendingVote(_ context.Context, _ database.Tx, _, _, _ int64) error {
	r.deleteCalls++
	return nil
}

func (r *fakeRepository) ListPendingVoteEdges(_ context.Context, _ database.Tx, _ int64) ([]entity.VoteEdge, error) {
	return r.edges, nil
}

func (r *fakeRepository) Propose(_ context.Context, _ database.Tx, _ int64, requestIDs []int64) error {
	r.proposed = append([]int64(nil), requestIDs...)
	return nil
}

type fakeTransactionManager struct{}

func (fakeTransactionManager) WithinTransaction(_ context.Context, fn func(database.Tx) error) error {
	return fn(nil)
}

func TestVoteProposesOnlyClosedPendingCycle(t *testing.T) {
	repository := &fakeRepository{
		length: 3,
		edges: []entity.VoteEdge{
			{RequestID: 10, TargetRequestID: 20, Position: 0},
			{RequestID: 10, TargetRequestID: 21, Position: 0},
			{RequestID: 20, TargetRequestID: 30, Position: 1},
			{RequestID: 21, TargetRequestID: 31, Position: 1},
			{RequestID: 30, TargetRequestID: 10, Position: 2},
		},
	}
	service := chainservice.NewService(repository, fakeTransactionManager{})

	result, err := service.Vote(context.Background(), "user-1", 7, chainservice.VoteInput{
		RequestID: 30, TargetRequestID: 10,
	})
	if err != nil {
		t.Fatalf("Vote() error = %v", err)
	}
	if result.ChainStatus != entity.ChainStatusProposed {
		t.Fatalf("status = %s, want %s", result.ChainStatus, entity.ChainStatusProposed)
	}
	want := []int64{10, 20, 30}
	for i := range want {
		if repository.proposed[i] != want[i] {
			t.Fatalf("proposed cycle = %v, want %v", repository.proposed, want)
		}
	}
}

func TestVoteKeepsCandidateWithoutClosedCycle(t *testing.T) {
	repository := &fakeRepository{
		length: 3,
		edges: []entity.VoteEdge{
			{RequestID: 10, TargetRequestID: 20, Position: 0},
			{RequestID: 20, TargetRequestID: 30, Position: 1},
		},
	}
	service := chainservice.NewService(repository, fakeTransactionManager{})

	result, err := service.Vote(context.Background(), "user-1", 7, chainservice.VoteInput{
		RequestID: 20, TargetRequestID: 30,
	})
	if err != nil {
		t.Fatalf("Vote() error = %v", err)
	}
	if result.ChainStatus != entity.ChainStatusCandidate || len(repository.proposed) != 0 {
		t.Fatalf("status = %s, proposed = %v", result.ChainStatus, repository.proposed)
	}
}

func TestVoteRetryAfterProposalIsIdempotent(t *testing.T) {
	votedAt := time.Date(2026, 8, 8, 12, 0, 0, 0, time.UTC)
	repository := &fakeRepository{
		status: entity.ChainStatusProposed,
		length: 3,
		existingVote: entity.ChainVote{
			ChainID: 7, RequestID: 10, TargetRequestID: 20,
			Vote: entity.VotePending, VotedAt: votedAt,
		},
	}
	service := chainservice.NewService(repository, fakeTransactionManager{})

	result, err := service.Vote(context.Background(), "user-1", 7, chainservice.VoteInput{
		RequestID: 10, TargetRequestID: 20,
	})
	if err != nil {
		t.Fatalf("Vote() error = %v", err)
	}
	if result.ChainStatus != entity.ChainStatusProposed || repository.upsertCalls != 0 {
		t.Fatalf("result = %+v, upsert calls = %d", result, repository.upsertCalls)
	}
}

func TestWithdrawVoteIsIdempotentWhileCandidate(t *testing.T) {
	repository := &fakeRepository{length: 3}
	service := chainservice.NewService(repository, fakeTransactionManager{})
	input := chainservice.VoteInput{RequestID: 10, TargetRequestID: 20}

	for attempt := 0; attempt < 2; attempt++ {
		if err := service.WithdrawVote(context.Background(), "user-1", 7, input); err != nil {
			t.Fatalf("WithdrawVote() attempt %d error = %v", attempt+1, err)
		}
	}
	if repository.deleteCalls != 2 {
		t.Fatalf("delete calls = %d, want 2 idempotent DELETE executions", repository.deleteCalls)
	}
}

func TestWithdrawVoteRejectedAfterProposal(t *testing.T) {
	repository := &fakeRepository{status: entity.ChainStatusProposed, length: 3}
	service := chainservice.NewService(repository, fakeTransactionManager{})
	err := service.WithdrawVote(context.Background(), "user-1", 7, chainservice.VoteInput{
		RequestID: 10, TargetRequestID: 20,
	})
	if !errors.Is(err, entity.ErrChainNotCandidate) {
		t.Fatalf("WithdrawVote() error = %v, want %v", err, entity.ErrChainNotCandidate)
	}
	if repository.deleteCalls != 0 {
		t.Fatalf("delete calls = %d, want 0", repository.deleteCalls)
	}
}
