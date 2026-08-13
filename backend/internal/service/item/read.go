package item

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository"
)

func (s *Service) Get(ctx context.Context, requesterID uuid.UUID, itemID int64) (*entity.Item, error) {
	return s.getOwned(ctx, requesterID, itemID)
}

func (s *Service) List(ctx context.Context, ownerID uuid.UUID, page, pageSize int) ([]*entity.Item, int, error) {
	page, pageSize = NormalizePagination(page, pageSize)
	return s.repo.ListByOwner(ctx, ownerID, page, pageSize)
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
