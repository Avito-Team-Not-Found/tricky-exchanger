package entity

import "time"

// ExchangeRequest — заявка пользователя: какой товар он отдаёт и что хочет получить.
//
// WantEmbedding не выдаётся HTTP-обработчиком: это внутреннее значение для matching.
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

// ExchangeRequestListItem содержит название предлагаемого товара, полученное
// тем же запросом, что и заявка. Это предотвращает N+1-запросы в списке.
type ExchangeRequestListItem struct {
	ExchangeRequest
	OfferedItemTitle string
}
