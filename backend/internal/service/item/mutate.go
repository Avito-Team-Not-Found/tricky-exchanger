package item

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/pkg/validator"
)

// Update — запрещено для ARCHIVED и hard-reserved.
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
