package matching_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/database"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/matching"
)

func TestFacadeSynchronizesAndRemovesClusterMembership(t *testing.T) {
	clusters := &fakeClusters{}
	cycles := &fakeCycles{clusters: clusters}
	chains := &fakeChains{cycles: cycles}
	facade := matching.NewFacade(clusters, cycles, chains)

	drafts, err := facade.RebuildForRequest(context.Background(), nil, 11)
	if err != nil {
		t.Fatalf("RebuildForRequest() error = %v", err)
	}
	if len(drafts) != 1 || drafts[0].Score != 0.9 {
		t.Fatalf("RebuildForRequest() drafts = %#v", drafts)
	}
	if len(chains.saved) != 1 || chains.saved[0].Score != 0.9 {
		t.Fatalf("saved drafts = %#v", chains.saved)
	}
	if err := facade.RemoveRequest(context.Background(), nil, 11); err != nil {
		t.Fatalf("RemoveRequest() error = %v", err)
	}
	if clusters.synchronizedID != 11 || clusters.removedID != 11 || cycles.searchedID != 11 {
		t.Fatalf("cluster calls = synchronize %d, remove %d", clusters.synchronizedID, clusters.removedID)
	}
}

func TestFacadePropagatesClusterError(t *testing.T) {
	wantErr := errors.New("cluster failed")
	cycles := &fakeCycles{}
	facade := matching.NewFacade(&fakeClusters{err: wantErr}, cycles, &fakeChains{})

	_, err := facade.RebuildForRequest(context.Background(), nil, 11)
	if !errors.Is(err, wantErr) {
		t.Fatalf("RebuildForRequest() error = %v, want %v", err, wantErr)
	}
	if cycles.searchedID != 0 {
		t.Fatal("cycle search must not run when cluster synchronization fails")
	}
}

func TestCandidateValidatorFiltersThresholdOwnerAndDuplicates(t *testing.T) {
	validator := matching.NewCandidateValidator(0.8)
	candidates := []entity.Candidate{
		{RequestID: 1, OwnerID: "other", Score: 0.95},
		{RequestID: 1, OwnerID: "other", Score: 0.90},
		{RequestID: 2, OwnerID: "me", Score: 0.99},
		{RequestID: 3, OwnerID: "other", Score: 0.79},
	}

	result := validator.Validate(context.Background(), candidates, "me")
	if len(result) != 1 || result[0].RequestID != 1 {
		t.Fatalf("Validate() = %#v, want only request 1", result)
	}
}

type fakeClusters struct {
	synchronizedID int64
	removedID      int64
	err            error
}

type fakeCycles struct {
	clusters   *fakeClusters
	searchedID int64
}

type fakeChains struct {
	cycles *fakeCycles
	saved  []entity.ChainDraft
}

func (c *fakeChains) SaveCandidates(_ context.Context, _ database.Tx, drafts []entity.ChainDraft) error {
	if c.cycles != nil && c.cycles.searchedID == 0 {
		return errors.New("chain saving started before cycle search")
	}
	c.saved = append(c.saved, drafts...)
	return nil
}

func (c *fakeCycles) Find(_ context.Context, _ database.Tx, requestID int64) ([]entity.ChainDraft, error) {
	if c.clusters != nil && c.clusters.synchronizedID != requestID {
		return nil, errors.New("cycle search started before cluster synchronization")
	}
	c.searchedID = requestID
	return []entity.ChainDraft{{Score: 0.9}}, nil
}

func (c *fakeClusters) Synchronize(_ context.Context, _ database.Tx, offerID int64) error {
	c.synchronizedID = offerID
	return c.err
}

func (c *fakeClusters) Remove(_ context.Context, _ database.Tx, offerID int64) error {
	c.removedID = offerID
	return c.err
}
