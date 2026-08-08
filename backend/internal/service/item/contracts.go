package item

import (
	"context"
	"io"

	"github.com/google/uuid"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

// ItemRepository — то, что service/item ожидает от слоя хранения.
// Реализация лежит в internal/repository/item.
type ItemRepository interface {
	Create(ctx context.Context, item *entity.Item) error
	GetByID(ctx context.Context, id int64) (*entity.Item, error)
	ListByOwner(ctx context.Context, ownerID uuid.UUID, page, pageSize int) ([]*entity.Item, int, error)
	Update(ctx context.Context, item *entity.Item) error
	UpdateStatus(ctx context.Context, id int64, status entity.ItemStatus) error
	UpdateImageURL(ctx context.Context, id int64, url string) error
	CategoryExists(ctx context.Context, categoryID int64) (bool, error)
}

// ReservationChecker — временный адаптер до появления полноценной фичи цепочек
// обмена. Реализация-заглушка лежит в internal/infrastructure/reservation.
type ReservationChecker interface {
	HasActiveHardReservation(ctx context.Context, itemID int64) (bool, error)
}

// Storage — объектное хранилище фото товаров (MinIO/S3-совместимое).
// Реализация лежит в internal/infrastructure/storage.
type Storage interface {
	Upload(ctx context.Context, objectName string, content io.Reader, size int64, contentType string) (url string, err error)
}
