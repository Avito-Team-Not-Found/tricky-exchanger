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
	facade := matching.NewFacade(clusters)

	if err := facade.RebuildForRequest(context.Background(), nil, 11); err != nil {
		t.Fatalf("RebuildForRequest() error = %v", err)
	}
	if err := facade.RemoveRequest(context.Background(), nil, 11); err != nil {
		t.Fatalf("RemoveRequest() error = %v", err)
	}
	if clusters.synchronizedID != 11 || clusters.removedID != 11 {
		t.Fatalf("cluster calls = synchronize %d, remove %d", clusters.synchronizedID, clusters.removedID)
	}
}

func TestFacadePropagatesClusterError(t *testing.T) {
	wantErr := errors.New("cluster failed")
	facade := matching.NewFacade(&fakeClusters{err: wantErr})

	err := facade.RebuildForRequest(context.Background(), nil, 11)
	if !errors.Is(err, wantErr) {
		t.Fatalf("RebuildForRequest() error = %v, want %v", err, wantErr)
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

func (c *fakeClusters) Synchronize(_ context.Context, _ database.Tx, offerID int64) error {
	c.synchronizedID = offerID
	return c.err
}

func (c *fakeClusters) Remove(_ context.Context, _ database.Tx, offerID int64) error {
	c.removedID = offerID
	return c.err
}
