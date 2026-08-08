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
)

// maxImageSize — максимальный размер загружаемого фото товара (5 МиБ).
const maxImageSize = 5 << 20

// imageExtensionByContentType — разрешённые типы фото и их расширения в ключе объекта.
var imageExtensionByContentType = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
}

// CreateInput содержит данные для создания товара.
type CreateInput struct {
	Title       string
	Description string
	CategoryID  *int64
}

// UpdateInput содержит новые данные для частичного изменения товара.
// nil означает "не менять это поле".
type UpdateInput struct {
	Title       *string
	Description *string
	CategoryID  *int64
	Status      *entity.ItemStatus
}

// Service реализует CRUD-сценарии работы с товарами без привязки к HTTP.
type Service struct {
	repo         ItemRepository
	reservations ReservationChecker
	embedding    embedding.Client
	storage      Storage
}

// NewService создаёт сервис товаров с зависимостями для хранения, проверки
// hard-резерваций, генерации embeddings и объектного хранилища фото.
func NewService(repo ItemRepository, reservations ReservationChecker, embeddingClient embedding.Client, storage Storage) *Service {
	return &Service{repo: repo, reservations: reservations, embedding: embeddingClient, storage: storage}
}

// Create создаёт активный товар от имени владельца.
func (s *Service) Create(ctx context.Context, ownerID uuid.UUID, input CreateInput) (*entity.Item, error) {
	title := strings.TrimSpace(input.Title)
	description := strings.TrimSpace(input.Description)

	if err := validateTitle(title); err != nil {
		return nil, err
	}
	if err := validateDescription(description); err != nil {
		return nil, err
	}
	if err := s.validateCategory(ctx, input.CategoryID); err != nil {
		return nil, err
	}

	embeddingValue, err := s.embedItem(ctx, title, description)
	if err != nil {
		return nil, err
	}

	item := &entity.Item{
		OwnerUserID: ownerID,
		Title:       title,
		Description: description,
		CategoryID:  input.CategoryID,
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
		title := strings.TrimSpace(*input.Title)
		if err := validateTitle(title); err != nil {
			return nil, err
		}
		item.Title = title
	}

	if input.Description != nil {
		description := strings.TrimSpace(*input.Description)
		if err := validateDescription(description); err != nil {
			return nil, err
		}
		item.Description = description
	}

	if input.CategoryID != nil {
		if err := s.validateCategory(ctx, input.CategoryID); err != nil {
			return nil, err
		}
		item.CategoryID = input.CategoryID
	}

	if input.Status != nil {
		if *input.Status != entity.ItemStatusActive && *input.Status != entity.ItemStatusUnavailable {
			return nil, entity.ErrInvalidItemStatus
		}
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

func (s *Service) validateCategory(ctx context.Context, categoryID *int64) error {
	if categoryID == nil {
		return nil
	}

	exists, err := s.repo.CategoryExists(ctx, *categoryID)
	if err != nil {
		return err
	}
	if !exists {
		return entity.ErrCategoryNotFound
	}

	return nil
}

func (s *Service) ensureNoHardReservation(ctx context.Context, itemID int64) error {
	if s.reservations == nil {
		return nil
	}

	reserved, err := s.reservations.HasActiveHardReservation(ctx, itemID)
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
