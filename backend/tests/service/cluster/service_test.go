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
	service := clusterservice.NewService(repository)

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
	service := clusterservice.NewService(repository)

	if err := service.Synchronize(context.Background(), nil, 10); err != nil {
		t.Fatalf("Synchronize() error = %v", err)
	}
	if repository.created != 0 {
		t.Fatalf("created clusters = %d, want 0", repository.created)
	}
	if len(repository.refreshedIDs) != 2 || repository.refreshedIDs[0] != oldClusterID || repository.refreshedIDs[1] != candidateID {
		t.Fatalf("refresh order = %v, want [3 5]", repository.refreshedIDs)
	}
}

func TestRemoveRefreshesOnlyExistingMembership(t *testing.T) {
	clusterID := int64(3)
	repository := &fakeRepository{oldClusterID: &clusterID}
	service := clusterservice.NewService(repository)

	if err := service.Remove(context.Background(), nil, 10); err != nil {
		t.Fatalf("Remove() error = %v", err)
	}
	if repository.refreshed != clusterID {
		t.Fatalf("refreshed cluster = %d, want 3", repository.refreshed)
	}
}

type fakeRepository struct {
	oldClusterID    *int64
	candidateID     *int64
	created         int
	memberClusterID int64
	memberOfferID   int64
	refreshed       int64
	refreshedIDs    []int64
}

func (r *fakeRepository) LoadVectors(context.Context, database.Tx, int64) (clusterservice.OfferVectors, error) {
	return clusterservice.OfferVectors{}, nil
}

func (r *fakeRepository) DeleteMembership(context.Context, database.Tx, int64) (*int64, error) {
	return r.oldClusterID, nil
}

func (r *fakeRepository) FindCandidateCluster(context.Context, database.Tx, int64, clusterservice.OfferVectors) (*int64, error) {
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
