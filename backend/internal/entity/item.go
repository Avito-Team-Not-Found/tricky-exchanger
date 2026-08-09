package entity

import (
	"time"

	"github.com/google/uuid"
)

// ItemStatus описывает этап жизненного цикла товара.
type ItemStatus string

const (
	ItemStatusActive      ItemStatus = "ACTIVE"
	ItemStatusUnavailable ItemStatus = "UNAVAILABLE"
	ItemStatusArchived    ItemStatus = "ARCHIVED"
)

// Item — товар, который пользователь может предложить в заявке на обмен.
type Item struct {
	ID          int64
	OwnerUserID uuid.UUID
	Title       string
	Description string
	// Category — текстовое имя категории (например, "Телефоны").
	Category  string
	Embedding []float32
	// ImageURL — публичный URL фото в объектном хранилище (MinIO), nil пока фото не загружено.
	ImageURL  *string
	Status    ItemStatus
	CreatedAt time.Time
	UpdatedAt time.Time
}
