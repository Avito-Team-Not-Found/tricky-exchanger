package chain_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/database"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	chainservice "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/chain"
)

func TestSaveCandidatesCanonicalizesCycleRotation(t *testing.T) {
	repository := &fakeRepository{}
	service := chainservice.NewService(repository)
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
			service := chainservice.NewService(repository)
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
	service := chainservice.NewService(repository)
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
	saved []entity.ChainDraft
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
