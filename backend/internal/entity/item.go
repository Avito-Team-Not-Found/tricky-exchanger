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
// Фото (image_url) сознательно не входит в эту версию — добавляется отдельной фичей.
type Item struct {
	ID          int64
	OwnerUserID uuid.UUID
	Title       string
	Description string
	CategoryID  *int64
	Status      ItemStatus
	CreatedAt   time.Time
	UpdatedAt   time.Time
}
