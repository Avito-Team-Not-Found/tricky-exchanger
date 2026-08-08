package item

import (
	"context"
	"io"

	"github.com/google/uuid"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	itemservice "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/item"
)

// itemService — контракт зависимостей HTTP-обработчика товаров.
type itemService interface {
	Create(ctx context.Context, ownerID uuid.UUID, input itemservice.CreateInput) (*entity.Item, error)
	Get(ctx context.Context, requesterID uuid.UUID, itemID int64) (*entity.Item, error)
	List(ctx context.Context, ownerID uuid.UUID, page, pageSize int) ([]*entity.Item, int, error)
	Update(ctx context.Context, requesterID uuid.UUID, itemID int64, input itemservice.UpdateInput) (*entity.Item, error)
	Archive(ctx context.Context, requesterID uuid.UUID, itemID int64) error
	UploadImage(ctx context.Context, requesterID uuid.UUID, itemID int64, content io.Reader, size int64, contentType string) (*entity.Item, error)
}
