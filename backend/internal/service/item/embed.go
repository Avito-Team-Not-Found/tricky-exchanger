package item

import (
	"context"
	"fmt"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

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
