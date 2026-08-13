package item

import (
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

type createItemRequest struct {
	Title       string `json:"title" validate:"not_empty,max=200"`
	Description string `json:"description" validate:"omitempty,max=2000"`
	Category    string `json:"category" validate:"not_empty,max=100"`
}

type updateItemRequest struct {
	Title       *string            `json:"title" validate:"omitempty,not_empty,max=200"`
	Description *string            `json:"description" validate:"omitempty,max=2000"`
	Category    *string            `json:"category" validate:"omitempty,max=100"`
	Status      *entity.ItemStatus `json:"status" validate:"omitempty,item_status"`
}

type listItemsQuery struct {
	Page     int `schema:"page" validate:"omitempty,gte=0"`
	PageSize int `schema:"pageSize" validate:"omitempty,gte=0"`
}
