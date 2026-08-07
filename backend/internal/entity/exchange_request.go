package entity

import "time"

// ExchangeRequest — заявка пользователя: какой товар он отдаёт и что хочет получить.
type ExchangeRequest struct {
	ID                int64
	UserID            string
	OfferedItemID     int64
	WantedDescription string
	WantEmbedding     []float32
	Status            RequestStatus
	Version           int64
	CreatedAt         time.Time
	UpdatedAt         time.Time
}
