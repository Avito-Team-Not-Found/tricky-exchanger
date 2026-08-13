package item

import (
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/infrastructure/embedding"
)

const maxImageSize = 5 << 20

const (
	defaultPage     = 1
	defaultPageSize = 20
	maxPageSize     = 100
)

var imageExtensionByContentType = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
}

type CreateInput struct {
	Title       string `json:"title" validate:"not_empty,max=200"`
	Description string `json:"description" validate:"omitempty,max=2000"`
	Category    string `json:"category" validate:"not_empty,max=100"`
}

// UpdateInput: nil-поле = не менять.
type UpdateInput struct {
	Title       *string            `json:"title" validate:"omitempty,not_empty,max=200"`
	Description *string            `json:"description" validate:"omitempty,max=2000"`
	Category    *string            `json:"category" validate:"omitempty,max=100"`
	Status      *entity.ItemStatus `json:"status" validate:"omitempty,item_status"`
}

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
