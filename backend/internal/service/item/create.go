package item

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/pkg/validator"
)

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
