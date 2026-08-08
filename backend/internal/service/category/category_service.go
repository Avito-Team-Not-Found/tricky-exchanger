// Package category содержит бизнес-логику работы со справочником категорий.
package category

import (
	"context"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

// CategoryRepository — то, что service/category ожидает от слоя хранения.
// Реализация лежит в internal/repository/category.
type CategoryRepository interface {
	List(ctx context.Context) ([]entity.Category, error)
}

// Service реализует сценарии работы со справочником категорий без привязки к HTTP.
type Service struct {
	repo CategoryRepository
}

// NewService создаёт сервис категорий.
func NewService(repo CategoryRepository) *Service {
	return &Service{repo: repo}
}

// List возвращает полный справочник категорий.
func (s *Service) List(ctx context.Context) ([]entity.Category, error) {
	return s.repo.List(ctx)
}