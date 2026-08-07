package item

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository"
)

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
}

// NewService создаёт сервис товаров с зависимостями для хранения и проверки hard-резерваций.
func NewService(repo ItemRepository, reservations ReservationChecker) *Service {
	return &Service{repo: repo, reservations: reservations}
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

	item := &entity.Item{
		OwnerUserID: ownerID,
		Title:       title,
		Description: description,
		CategoryID:  input.CategoryID,
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
