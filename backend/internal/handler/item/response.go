package item

import (
	"time"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

type itemResponse struct {
	ID          int64   `json:"id"`
	OwnerUserID string  `json:"ownerUserId"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Category    string  `json:"category"`
	ImageURL    *string `json:"imageUrl"`
	Status      string  `json:"status"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
}

type listItemsResponse struct {
	Items    []itemResponse `json:"items"`
	Page     int            `json:"page"`
	PageSize int            `json:"pageSize"`
	Total    int            `json:"total"`
}

func newItemResponse(item *entity.Item) itemResponse {
	return itemResponse{
		ID:          item.ID,
		OwnerUserID: item.OwnerUserID.String(),
		Title:       item.Title,
		Description: item.Description,
		Category:    item.Category,
		ImageURL:    item.ImageURL,
		Status:      string(item.Status),
		CreatedAt:   item.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:   item.UpdatedAt.UTC().Format(time.RFC3339),
	}
}
