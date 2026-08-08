package item

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/google/uuid"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/infrastructure/embedding"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/pkg/validator"
)

// maxImageSize — максимальный размер загружаемого фото товара (5 МиБ).
const maxImageSize = 5 << 20

const (
	defaultPage     = 1
	defaultPageSize = 20
	maxPageSize     = 100
)

// imageExtensionByContentType — разрешённые типы фото и их расширения в ключе объекта.
var imageExtensionByContentType = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
}

// CreateInput содержит данные для создания товара.
type CreateInput struct {
	Title       string `json:"title" validate:"not_empty,max=200"`
	Description string `json:"description" validate:"omitempty,max=2000"`
	Category    string `json:"category" validate:"omitempty,max=100"`
}

// UpdateInput содержит новые данные для частичного изменения товара.
// nil означает "не менять это поле".
type UpdateInput struct {
	Title       *string            `json:"title" validate:"omitempty,not_empty,max=200"`
	Description *string            `json:"description" validate:"omitempty,max=2000"`
	Category    *string            `json:"category" validate:"omitempty,max=100"`
	Status      *entity.ItemStatus `json:"status" validate:"omitempty,item_status"`
}

// NormalizePagination подставляет значения по умолчанию и ограничивает pageSize,
// чтобы список товаров нельзя было запросить целиком одним запросом.
func NormalizePagination(page, pageSize int) (int, int) {
	if page < 1 {
		page = defaultPage
	}
	if pageSize < 1 {
		pageSize = defaultPageSize
	}
	if pageSize > maxPageSize {
		pageSize = maxPageSize
	}
	return page, pageSize
}

type Service struct {
	repo      ItemRepository
	embedding embedding.Client
	storage   Storage
}

func NewService(repo ItemRepository, embeddingClient embedding.Client, storage Storage) *Service {
	return &Service{repo: repo, embedding: embeddingClient, storage: storage}
}

// Create создаёт активный товар от имени владельца.
func (s *Service) Create(ctx context.Context, ownerID uuid.UUID, input CreateInput) (*entity.Item, error) {
	if err := validator.Validate(&input); err != nil {
		return nil, err
	}

	title := strings.TrimSpace(input.Title)
	description := strings.TrimSpace(input.Description)

	embeddingValue, err := s.embedItem(ctx, title, description)
	if err != nil {
		return nil, err
	}

	item := &entity.Item{
		OwnerUserID: ownerID,
		Title:       title,
		Description: description,
		Category:    strings.TrimSpace(input.Category),
		Embedding:   embeddingValue,
		Status:      entity.ItemStatusActive,
	}

	if err := s.repo.Create(ctx, item); err != nil {
		return nil, err
	}

	return item, nil
}

// Get возвращает товар, если запрашивающий пользователь — его владелец.
// Чужой и несуществующий товар неразличимы для вызывающего (оба — ErrItemNotFound),
// чтобы не подтверждать существование чужих товаров.
func (s *Service) Get(ctx context.Context, requesterID uuid.UUID, itemID int64) (*entity.Item, error) {
	return s.getOwned(ctx, requesterID, itemID)
}

// List возвращает страницу товаров владельца (включая архивные — это его личный список).
func (s *Service) List(ctx context.Context, ownerID uuid.UUID, page, pageSize int) ([]*entity.Item, int, error) {
	page, pageSize = NormalizePagination(page, pageSize)
	return s.repo.ListByOwner(ctx, ownerID, page, pageSize)
}

// Update частично изменяет товар. Запрещено для архивных товаров и товаров
// с активной hard-резервацией.
func (s *Service) Update(ctx context.Context, requesterID uuid.UUID, itemID int64, input UpdateInput) (*entity.Item, error) {
	if err := validator.Validate(&input); err != nil {
		return nil, err
	}

	item, err := s.getOwned(ctx, requesterID, itemID)
	if err != nil {
		return nil, err
	}

	if item.Status == entity.ItemStatusArchived {
		return nil, entity.ErrItemArchived
	}

	if err := s.ensureNoHardReservation(ctx, itemID); err != nil {
		return nil, err
	}

	if input.Title != nil {
		item.Title = strings.TrimSpace(*input.Title)
	}

	if input.Description != nil {
		item.Description = strings.TrimSpace(*input.Description)
	}

	if input.Category != nil {
		item.Category = strings.TrimSpace(*input.Category)
	}

	if input.Status != nil {
		item.Status = *input.Status
	}

	if input.Title != nil || input.Description != nil {
		embeddingValue, err := s.embedItem(ctx, item.Title, item.Description)
		if err != nil {
			return nil, err
		}
		item.Embedding = embeddingValue
	}

	if err := s.repo.Update(ctx, item); err != nil {
		return nil, err
	}

	return item, nil
}

// Archive переводит товар в статус ARCHIVED. Повторная архивация уже архивного
// товара — ошибка (entity.ErrItemArchived), а не no-op.
func (s *Service) Archive(ctx context.Context, requesterID uuid.UUID, itemID int64) error {
	item, err := s.getOwned(ctx, requesterID, itemID)
	if err != nil {
		return err
	}

	if item.Status == entity.ItemStatusArchived {
		return entity.ErrItemArchived
	}

	if err := s.ensureNoHardReservation(ctx, itemID); err != nil {
		return err
	}

	return s.repo.UpdateStatus(ctx, itemID, entity.ItemStatusArchived)
}

// UploadImage загружает фото товара в объектное хранилище и сохраняет публичный
// URL в записи товара. Запрещено для архивных товаров и товаров с активной
// hard-резервацией — как и остальные мутации (см. Update).
func (s *Service) UploadImage(ctx context.Context, requesterID uuid.UUID, itemID int64, content io.Reader, size int64, contentType string) (*entity.Item, error) {
	item, err := s.getOwned(ctx, requesterID, itemID)
	if err != nil {
		return nil, err
	}

	if item.Status == entity.ItemStatusArchived {
		return nil, entity.ErrItemArchived
	}

	if err := s.ensureNoHardReservation(ctx, itemID); err != nil {
		return nil, err
	}

	ext, ok := imageExtensionByContentType[contentType]
	if !ok {
		return nil, entity.ErrInvalidImageType
	}
	if size <= 0 || size > maxImageSize {
		return nil, entity.ErrImageTooLarge
	}

	objectName := fmt.Sprintf("items/%d/%s%s", itemID, uuid.NewString(), ext)
	url, err := s.storage.Upload(ctx, objectName, content, size, contentType)
	if err != nil {
		return nil, err
	}

	if err := s.repo.UpdateImageURL(ctx, itemID, url); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, entity.ErrItemNotFound
		}
		return nil, err
	}

	item.ImageURL = &url
	return item, nil
}

func (s *Service) getOwned(ctx context.Context, requesterID uuid.UUID, itemID int64) (*entity.Item, error) {
	item, err := s.repo.GetByID(ctx, itemID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, entity.ErrItemNotFound
	}
	if err != nil {
		return nil, err
	}

	if item.OwnerUserID != requesterID {
		return nil, entity.ErrItemForbidden
	}

	return item, nil
}

func (s *Service) ensureNoHardReservation(ctx context.Context, itemID int64) error {
	reserved, err := s.repo.HasActiveHardReservation(ctx, itemID)
	if err != nil {
		return err
	}
	if reserved {
		return entity.ErrItemHasHardReservation
	}
	return nil
}

func (s *Service) embedItem(ctx context.Context, title, description string) ([]float32, error) {
	if s.embedding == nil {
		return nil, entity.ErrEmbeddingNotConfigured
	}

	prompt := "passage: " + title
	if description != "" {
		prompt += "\n" + description
	}

	result, err := s.embedding.Embed(ctx, prompt)
	if err != nil {
		return nil, fmt.Errorf("embed item: %w", err)
	}
	if len(result) == 0 {
		return nil, entity.ErrEmptyEmbedding
	}
	return result, nil
}
