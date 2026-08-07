package exchange_request_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	requestservice "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/exchange_request"
)

func TestCreateEmbedsThenPersistsAndRebuildsMatching(t *testing.T) {
	store := &fakeStore{}
	embeddings := &fakeEmbedding{vector: []float32{0.1, 0.2}}
	matcher := &fakeMatcher{}
	service := requestservice.NewService(store, embeddings, matcher)

	created, err := service.Create(context.Background(), "user-1", requestservice.CreateInput{
		OfferedItemID:     42,
		WantedDescription: "  кофемашина  ",
	})
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	if store.created.Status != entity.RequestStatusActive || store.created.Version != 1 {
		t.Fatalf("unexpected stored request state: %#v", store.created)
	}
	if store.created.WantedDescription != "кофемашина" {
		t.Fatalf("description was not trimmed: %q", store.created.WantedDescription)
	}
	if got, want := embeddings.prompt, "кофемашина"; got != want {
		t.Fatalf("embedding prompt = %q, want %q", got, want)
	}
	if matcher.rebuiltID != created.ID {
		t.Fatalf("matching rebuilt %d, want %d", matcher.rebuiltID, created.ID)
	}
}

func TestUpdatePropagatesVersionAndRebuildsMatching(t *testing.T) {
	store := &fakeStore{updated: entity.ExchangeOffer{ID: 7, Version: 3}}
	matcher := &fakeMatcher{}
	service := requestservice.NewService(store, &fakeEmbedding{vector: []float32{0.3}}, matcher)

	updated, err := service.Update(context.Background(), "user-1", 7, requestservice.UpdateInput{
		OfferedItemID:     44,
		WantedDescription: "ноутбук",
		Version:           2,
	})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if store.expectedVersion != 2 {
		t.Fatalf("expected version = %d, want 2", store.expectedVersion)
	}
	if matcher.rebuiltID != updated.ID {
		t.Fatalf("matching rebuilt %d, want %d", matcher.rebuiltID, updated.ID)
	}
}

func TestDeleteArchivesThenRemovesFromMatching(t *testing.T) {
	store := &fakeStore{archived: entity.ExchangeOffer{ID: 9, Status: entity.RequestStatusRemoved, Version: 2}}
	matcher := &fakeMatcher{}
	service := requestservice.NewService(store, &fakeEmbedding{}, matcher)

	if err := service.Delete(context.Background(), "user-1", 9, 1); err != nil {
		t.Fatalf("Delete() error = %v", err)
	}
	if matcher.removedID != 9 {
		t.Fatalf("matching removed %d, want 9", matcher.removedID)
	}
}

func TestUpdateRejectsEmptyDescriptionBeforeEmbedding(t *testing.T) {
	embeddings := &fakeEmbedding{vector: []float32{0.1}}
	service := requestservice.NewService(&fakeStore{}, embeddings, &fakeMatcher{})

	_, err := service.Update(context.Background(), "user-1", 1, requestservice.UpdateInput{
		OfferedItemID:     2,
		WantedDescription: " ",
		Version:           1,
	})
	if !errors.Is(err, entity.ErrWantedDescriptionRequired) {
		t.Fatalf("Update() error = %v, want ErrWantedDescription", err)
	}
	if embeddings.calls != 0 {
		t.Fatalf("embedding calls = %d, want 0", embeddings.calls)
	}
}

type fakeStore struct {
	created         entity.ExchangeOffer
	updated         entity.ExchangeOffer
	archived        entity.ExchangeOffer
	expectedVersion int64
}

func (s *fakeStore) Create(_ context.Context, request entity.ExchangeOffer) (entity.ExchangeOffer, error) {
	request.ID = 5
	request.CreatedAt = time.Now()
	request.UpdatedAt = request.CreatedAt
	s.created = request
	return request, nil
}

func (s *fakeStore) Get(_ context.Context, _ string, _ int64) (entity.ExchangeOffer, error) {
	return entity.ExchangeOffer{}, entity.ErrExchangeRequestNotFound
}

func (s *fakeStore) List(_ context.Context, _ string) ([]entity.ExchangeOfferListItem, error) {
	return nil, nil
}

func (s *fakeStore) Update(_ context.Context, request entity.ExchangeOffer, expectedVersion int64) (entity.ExchangeOffer, error) {
	s.expectedVersion = expectedVersion
	if s.updated.ID == 0 {
		s.updated = request
		s.updated.Version = expectedVersion + 1
	}
	return s.updated, nil
}

func (s *fakeStore) Archive(_ context.Context, _ string, _ int64, expectedVersion int64) (entity.ExchangeOffer, error) {
	s.expectedVersion = expectedVersion
	if s.archived.ID == 0 {
		return entity.ExchangeOffer{}, entity.ErrExchangeRequestNotFound
	}
	return s.archived, nil
}

type fakeEmbedding struct {
	vector []float32
	prompt string
	calls  int
}

func (e *fakeEmbedding) Embed(_ context.Context, prompt string) ([]float32, error) {
	e.calls++
	e.prompt = prompt
	return e.vector, nil
}

type fakeMatcher struct {
	rebuiltID int64
	removedID int64
}

func (m *fakeMatcher) RebuildForRequest(_ context.Context, requestID int64) error {
	m.rebuiltID = requestID
	return nil
}

func (m *fakeMatcher) RemoveRequest(_ context.Context, requestID int64) error {
	m.removedID = requestID
	return nil
}
