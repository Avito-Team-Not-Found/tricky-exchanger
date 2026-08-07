package item_test

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository"
	itemservice "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/item"
)

var ownerID = uuid.MustParse("11111111-1111-1111-1111-111111111111")

func TestCreateTrimsAndPersistsActiveItem(t *testing.T) {
	repo := &fakeRepo{}
	service := itemservice.NewService(repo, &fakeReservations{}, &fakeStorage{})

	created, err := service.Create(context.Background(), ownerID, itemservice.CreateInput{
		Title:       "  PlayStation 5  ",
		Description: "  в отличном состоянии  ",
	})
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	if created.Title != "PlayStation 5" || created.Description != "в отличном состоянии" {
		t.Fatalf("Create() did not trim fields: %#v", created)
	}
	if created.Status != entity.ItemStatusActive {
		t.Fatalf("Create() status = %s, want ACTIVE", created.Status)
	}
	if repo.created == nil {
		t.Fatalf("expected repository.Create to be called")
	}
}

func TestCreateRejectsEmptyTitle(t *testing.T) {
	repo := &fakeRepo{}
	service := itemservice.NewService(repo, &fakeReservations{}, &fakeStorage{})

	_, err := service.Create(context.Background(), ownerID, itemservice.CreateInput{Title: "   "})
	if !errors.Is(err, entity.ErrTitleRequired) {
		t.Fatalf("Create() error = %v, want ErrTitleRequired", err)
	}
	if repo.created != nil {
		t.Fatalf("repository.Create must not be called on validation failure")
	}
}

func TestCreateRejectsUnknownCategory(t *testing.T) {
	repo := &fakeRepo{categoryExists: false}
	service := itemservice.NewService(repo, &fakeReservations{}, &fakeStorage{})

	categoryID := int64(999)
	_, err := service.Create(context.Background(), ownerID, itemservice.CreateInput{
		Title:      "Item",
		CategoryID: &categoryID,
	})
	if !errors.Is(err, entity.ErrCategoryNotFound) {
		t.Fatalf("Create() error = %v, want ErrCategoryNotFound", err)
	}
}

func TestGetReturnsNotFoundForOtherOwner(t *testing.T) {
	repo := &fakeRepo{item: &entity.Item{ID: 1, OwnerUserID: uuid.New()}}
	service := itemservice.NewService(repo, &fakeReservations{}, &fakeStorage{})

	_, err := service.Get(context.Background(), ownerID, 1)
	if !errors.Is(err, entity.ErrItemForbidden) {
		t.Fatalf("Get() error = %v, want ErrItemForbidden", err)
	}
}

func TestGetReturnsNotFoundWhenMissing(t *testing.T) {
	repo := &fakeRepo{getErr: repository.ErrNotFound}
	service := itemservice.NewService(repo, &fakeReservations{}, &fakeStorage{})

	_, err := service.Get(context.Background(), ownerID, 1)
	if !errors.Is(err, entity.ErrItemNotFound) {
		t.Fatalf("Get() error = %v, want ErrItemNotFound", err)
	}
}

func TestListNormalizesPagination(t *testing.T) {
	repo := &fakeRepo{}
	service := itemservice.NewService(repo, &fakeReservations{}, &fakeStorage{})

	if _, _, err := service.List(context.Background(), ownerID, 0, 0); err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if repo.listPage != 1 || repo.listPageSize != 20 {
		t.Fatalf("List() page=%d pageSize=%d, want 1/20", repo.listPage, repo.listPageSize)
	}

	if _, _, err := service.List(context.Background(), ownerID, 2, 500); err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if repo.listPage != 2 || repo.listPageSize != 100 {
		t.Fatalf("List() page=%d pageSize=%d, want 2/100 (capped)", repo.listPage, repo.listPageSize)
	}
}

func TestUpdateRejectsArchivedItem(t *testing.T) {
	repo := &fakeRepo{item: &entity.Item{ID: 1, OwnerUserID: ownerID, Status: entity.ItemStatusArchived}}
	service := itemservice.NewService(repo, &fakeReservations{}, &fakeStorage{})

	title := "new title"
	_, err := service.Update(context.Background(), ownerID, 1, itemservice.UpdateInput{Title: &title})
	if !errors.Is(err, entity.ErrItemArchived) {
		t.Fatalf("Update() error = %v, want ErrItemArchived", err)
	}
}

func TestUpdateRejectsHardReservation(t *testing.T) {
	repo := &fakeRepo{item: &entity.Item{ID: 1, OwnerUserID: ownerID, Status: entity.ItemStatusActive}}
	service := itemservice.NewService(repo, &fakeReservations{reserved: true}, &fakeStorage{})

	title := "new title"
	_, err := service.Update(context.Background(), ownerID, 1, itemservice.UpdateInput{Title: &title})
	if !errors.Is(err, entity.ErrItemHasHardReservation) {
		t.Fatalf("Update() error = %v, want ErrItemHasHardReservation", err)
	}
}

func TestArchiveRejectsAlreadyArchivedItem(t *testing.T) {
	repo := &fakeRepo{item: &entity.Item{ID: 1, OwnerUserID: ownerID, Status: entity.ItemStatusArchived}}
	service := itemservice.NewService(repo, &fakeReservations{}, &fakeStorage{})

	if err := service.Archive(context.Background(), ownerID, 1); !errors.Is(err, entity.ErrItemArchived) {
		t.Fatalf("Archive() error = %v, want ErrItemArchived", err)
	}
}

func TestArchiveUpdatesStatus(t *testing.T) {
	repo := &fakeRepo{item: &entity.Item{ID: 1, OwnerUserID: ownerID, Status: entity.ItemStatusActive}}
	service := itemservice.NewService(repo, &fakeReservations{}, &fakeStorage{})

	if err := service.Archive(context.Background(), ownerID, 1); err != nil {
		t.Fatalf("Archive() error = %v", err)
	}
	if repo.statusSet != entity.ItemStatusArchived {
		t.Fatalf("repository.UpdateStatus called with %s, want ARCHIVED", repo.statusSet)
	}
}

func TestUploadImageRejectsUnsupportedContentType(t *testing.T) {
	repo := &fakeRepo{item: &entity.Item{ID: 1, OwnerUserID: ownerID, Status: entity.ItemStatusActive}}
	service := itemservice.NewService(repo, &fakeReservations{}, &fakeStorage{})

	_, err := service.UploadImage(context.Background(), ownerID, 1, strings.NewReader("data"), 4, "application/pdf")
	if !errors.Is(err, entity.ErrInvalidImageType) {
		t.Fatalf("UploadImage() error = %v, want ErrInvalidImageType", err)
	}
}

func TestUploadImageRejectsOversizedFile(t *testing.T) {
	repo := &fakeRepo{item: &entity.Item{ID: 1, OwnerUserID: ownerID, Status: entity.ItemStatusActive}}
	service := itemservice.NewService(repo, &fakeReservations{}, &fakeStorage{})

	_, err := service.UploadImage(context.Background(), ownerID, 1, strings.NewReader("data"), 6<<20, "image/jpeg")
	if !errors.Is(err, entity.ErrImageTooLarge) {
		t.Fatalf("UploadImage() error = %v, want ErrImageTooLarge", err)
	}
}

func TestUploadImageRejectsArchivedItem(t *testing.T) {
	repo := &fakeRepo{item: &entity.Item{ID: 1, OwnerUserID: ownerID, Status: entity.ItemStatusArchived}}
	service := itemservice.NewService(repo, &fakeReservations{}, &fakeStorage{})

	_, err := service.UploadImage(context.Background(), ownerID, 1, strings.NewReader("data"), 4, "image/jpeg")
	if !errors.Is(err, entity.ErrItemArchived) {
		t.Fatalf("UploadImage() error = %v, want ErrItemArchived", err)
	}
}

func TestUploadImageSavesURLAndReturnsUpdatedItem(t *testing.T) {
	repo := &fakeRepo{item: &entity.Item{ID: 1, OwnerUserID: ownerID, Status: entity.ItemStatusActive}}
	service := itemservice.NewService(repo, &fakeReservations{}, &fakeStorage{})

	updated, err := service.UploadImage(context.Background(), ownerID, 1, strings.NewReader("data"), 4, "image/png")
	if err != nil {
		t.Fatalf("UploadImage() error = %v", err)
	}
	if updated.ImageURL == nil || *updated.ImageURL == "" {
		t.Fatalf("UploadImage() did not set ImageURL: %#v", updated)
	}
	if repo.imageURLSet != *updated.ImageURL {
		t.Fatalf("repository.UpdateImageURL called with %q, want %q", repo.imageURLSet, *updated.ImageURL)
	}
}

type fakeRepo struct {
	item           *entity.Item
	getErr         error
	created        *entity.Item
	categoryExists bool
	listPage       int
	listPageSize   int
	statusSet      entity.ItemStatus
	imageURLSet    string
}

func (r *fakeRepo) Create(_ context.Context, item *entity.Item) error {
	item.ID = 1
	item.CreatedAt = time.Now()
	item.UpdatedAt = item.CreatedAt
	r.created = item
	return nil
}

func (r *fakeRepo) GetByID(_ context.Context, _ int64) (*entity.Item, error) {
	if r.getErr != nil {
		return nil, r.getErr
	}
	if r.item == nil {
		return nil, repository.ErrNotFound
	}
	return r.item, nil
}

func (r *fakeRepo) ListByOwner(_ context.Context, _ uuid.UUID, page, pageSize int) ([]*entity.Item, int, error) {
	r.listPage = page
	r.listPageSize = pageSize
	return nil, 0, nil
}

func (r *fakeRepo) Update(_ context.Context, item *entity.Item) error {
	r.item = item
	return nil
}

func (r *fakeRepo) UpdateStatus(_ context.Context, _ int64, status entity.ItemStatus) error {
	r.statusSet = status
	return nil
}

func (r *fakeRepo) CategoryExists(_ context.Context, _ int64) (bool, error) {
	return r.categoryExists, nil
}

func (r *fakeRepo) UpdateImageURL(_ context.Context, _ int64, url string) error {
	if r.item == nil {
		return repository.ErrNotFound
	}
	r.imageURLSet = url
	return nil
}

type fakeReservations struct {
	reserved bool
}

func (f *fakeReservations) HasActiveHardReservation(_ context.Context, _ int64) (bool, error) {
	return f.reserved, nil
}

type fakeStorage struct {
	uploadErr error
}

func (f *fakeStorage) Upload(_ context.Context, objectName string, _ io.Reader, _ int64, _ string) (string, error) {
	if f.uploadErr != nil {
		return "", f.uploadErr
	}
	return "http://minio.local/items/" + objectName, nil
}
