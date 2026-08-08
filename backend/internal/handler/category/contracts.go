package category

import (
	"context"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

// categoryService — контракт зависимостей HTTP-обработчика категорий.
type categoryService interface {
	List(ctx context.Context) ([]entity.Category, error)
}