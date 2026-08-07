package cluster_test

import (
	"context"
	"testing"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/database"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	clusterservice "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/cluster"
)

func TestSynchronizeCreatesClusterWhenCandidateIsMissing(t *testing.T) {
	repository := &fakeRepository{}
	searcher := &fakeSearcher{}
	service := clusterservice.NewService(repository, searcher, 50, 0.8)

	if err := service.Synchronize(context.Background(), nil, 10); err != nil {
		t.Fatalf("Synchronize() error = %v", err)
	}
	if repository.created != 1 {
		t.Fatalf("created clusters = %d, want 1", repository.created)
	}
	if repository.memberClusterID != 7 || repository.memberOfferID != 10 {
		t.Fatalf("member = (%d, %d), want (7, 10)", repository.memberClusterID, repository.memberOfferID)
	}
	if repository.refreshed != 7 {
		t.Fatalf("refreshed cluster = %d, want 7", repository.refreshed)
	}
}

func TestSynchronizeRefreshesOldClusterAndUsesCandidate(t *testing.T) {
	oldClusterID := int64(3)
	candidateID := int64(5)
	repository := &fakeRepository{oldClusterID: &oldClusterID, candidateID: &candidateID}
	searcher := &fakeSearcher{candidates: []entity.Candidate{{RequestID: 42}}}
	service := clusterservice.NewService(repository, searcher, 50, 0.8)

	if err := service.Synchronize(context.Background(), nil, 10); err != nil {
		t.Fatalf("Synchronize() error = %v", err)
	}
	if repository.created != 0 {
		t.Fatalf("created clusters = %d, want 0", repository.created)
	}
	if len(repository.refreshedIDs) != 2 || repository.refreshedIDs[0] != oldClusterID || repository.refreshedIDs[1] != candidateID {
		t.Fatalf("refresh order = %v, want [3 5]", repository.refreshedIDs)
	}
	if len(repository.candidateOfferIDs) != 1 || repository.candidateOfferIDs[0] != 42 {
		t.Fatalf("candidate IDs = %v, want [42]", repository.candidateOfferIDs)
	}
	if searcher.excludeOfferID != 10 || searcher.topK != 50 || searcher.threshold != 0.8 {
		t.Fatalf("search args = exclude %d, topK %d, threshold %v", searcher.excludeOfferID, searcher.topK, searcher.threshold)
	}
	if searcher.categoryID == nil || *searcher.categoryID != 3 {
		t.Fatalf("search category = %v, want 3", searcher.categoryID)
	}
}

func TestRemoveRefreshesOnlyExistingMembership(t *testing.T) {
	clusterID := int64(3)
	repository := &fakeRepository{oldClusterID: &clusterID}
	service := clusterservice.NewService(repository, &fakeSearcher{}, 50, 0.8)

	if err := service.Remove(context.Background(), nil, 10); err != nil {
		t.Fatalf("Remove() error = %v", err)
	}
	if repository.refreshed != clusterID {
		t.Fatalf("refreshed cluster = %d, want 3", repository.refreshed)
	}
}

type fakeRepository struct {
	oldClusterID      *int64
	candidateID       *int64
	created           int
	memberClusterID   int64
	memberOfferID     int64
	refreshed         int64
	refreshedIDs      []int64
	candidateOfferIDs []int64
}

func (r *fakeRepository) LoadVectors(context.Context, database.Tx, int64) (clusterservice.OfferVectors, error) {
	categoryID := int64(3)
	return clusterservice.OfferVectors{
		OfferEmbedding: "[1,0]",
		WantEmbedding:  "[0,1]",
		CategoryID:     &categoryID,
	}, nil
}

func (r *fakeRepository) DeleteMembership(context.Context, database.Tx, int64) (*int64, error) {
	return r.oldClusterID, nil
}

func (r *fakeRepository) FindClusterForCandidates(_ context.Context, _ database.Tx, offerIDs []int64) (*int64, error) {
	r.candidateOfferIDs = append([]int64(nil), offerIDs...)
	return r.candidateID, nil
}

func (r *fakeRepository) Create(context.Context, database.Tx) (int64, error) {
	r.created++
	return 7, nil
}

func (r *fakeRepository) AddMember(_ context.Context, _ database.Tx, clusterID, offerID int64) error {
	r.memberClusterID = clusterID
	r.memberOfferID = offerID
	return nil
}

func (r *fakeRepository) Refresh(_ context.Context, _ database.Tx, clusterID int64) error {
	r.refreshed = clusterID
	r.refreshedIDs = append(r.refreshedIDs, clusterID)
	return nil
}

func (r *fakeRepository) ListActiveMembers(context.Context, int64) ([]entity.ExchangeOffer, error) {
	return nil, nil
}

type fakeSearcher struct {
	candidates     []entity.Candidate
	categoryID     *int64
	excludeOfferID int64
	topK           int
	threshold      float64
}

func (s *fakeSearcher) FindSimilarOffers(
	_ context.Context,
	_, _ string,
	categoryID *int64,
	excludeOfferID int64,
	threshold float64,
	topK int,
) ([]entity.Candidate, error) {
	s.categoryID = categoryID
	s.excludeOfferID = excludeOfferID
	s.threshold = threshold
	s.topK = topK
	return s.candidates, nil
}
