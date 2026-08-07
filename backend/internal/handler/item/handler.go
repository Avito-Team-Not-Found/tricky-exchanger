// Package item содержит HTTP-обработчики CRUD товаров.
package item

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/api"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/middleware"
	itemservice "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/item"
)

// Handler обрабатывает HTTP-запросы CRUD товаров.
// Владелец берётся только из JWT-мидлвари, а не из тела запроса.
type Handler struct {
	service itemService
}

func NewHandler(service itemService) *Handler {
	return &Handler{service: service}
}

type createItemRequest struct {
	Title       string `json:"title" binding:"required"`
	Description string `json:"description"`
	CategoryID  *int64 `json:"categoryId"`
}

type updateItemRequest struct {
	Title       *string            `json:"title"`
	Description *string            `json:"description"`
	CategoryID  *int64             `json:"categoryId"`
	Status      *entity.ItemStatus `json:"status"`
}

type itemResponse struct {
	ID          int64  `json:"id"`
	OwnerUserID string `json:"ownerUserId"`
	Title       string `json:"title"`
	Description string `json:"description"`
	CategoryID  *int64 `json:"categoryId"`
	Status      string `json:"status"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

type listItemsResponse struct {
	Items    []itemResponse `json:"items"`
	Page     int            `json:"page"`
	PageSize int            `json:"pageSize"`
	Total    int            `json:"total"`
}

func (h *Handler) Create(c *gin.Context) {
	ownerID, ok := currentUserID(c)
	if !ok {
		return
	}

	var body createItemRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		api.SendError(c, http.StatusUnprocessableEntity, "invalid request body")
		return
	}

	created, err := h.service.Create(c.Request.Context(), ownerID, itemservice.CreateInput{
		Title:       body.Title,
		Description: body.Description,
		CategoryID:  body.CategoryID,
	})
	if err != nil {
		writeItemError(c, err)
		return
	}

	api.SendOk(c, http.StatusCreated, newItemResponse(created))
}

func (h *Handler) Get(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	itemID, ok := pathID(c)
	if !ok {
		return
	}

	found, err := h.service.Get(c.Request.Context(), userID, itemID)
	if err != nil {
		writeItemError(c, err)
		return
	}

	api.SendOk(c, http.StatusOK, newItemResponse(found))
}

func (h *Handler) List(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	page, ok := queryInt(c, "page", 0)
	if !ok {
		return
	}
	pageSize, ok := queryInt(c, "pageSize", 0)
	if !ok {
		return
	}
	page, pageSize = itemservice.NormalizePagination(page, pageSize)

	items, total, err := h.service.List(c.Request.Context(), userID, page, pageSize)
	if err != nil {
		api.SendError(c, http.StatusInternalServerError, "internal server error")
		return
	}

	response := listItemsResponse{
		Items:    make([]itemResponse, 0, len(items)),
		Page:     page,
		PageSize: pageSize,
		Total:    total,
	}
	for _, it := range items {
		response.Items = append(response.Items, newItemResponse(it))
	}

	api.SendOk(c, http.StatusOK, response)
}

func (h *Handler) Update(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	itemID, ok := pathID(c)
	if !ok {
		return
	}

	var body updateItemRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		api.SendError(c, http.StatusUnprocessableEntity, "invalid request body")
		return
	}

	updated, err := h.service.Update(c.Request.Context(), userID, itemID, itemservice.UpdateInput{
		Title:       body.Title,
		Description: body.Description,
		CategoryID:  body.CategoryID,
		Status:      body.Status,
	})
	if err != nil {
		writeItemError(c, err)
		return
	}

	api.SendOk(c, http.StatusOK, newItemResponse(updated))
}

func (h *Handler) Archive(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	itemID, ok := pathID(c)
	if !ok {
		return
	}

	if err := h.service.Archive(c.Request.Context(), userID, itemID); err != nil {
		writeItemError(c, err)
		return
	}

	c.Status(http.StatusNoContent)
}

func writeItemError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, entity.ErrItemNotFound), errors.Is(err, entity.ErrItemForbidden):
		// Чужой и несуществующий товар неразличимы для клиента — не подтверждаем
		// существование чужих товаров.
		api.SendError(c, http.StatusNotFound, "item not found")
	case errors.Is(err, entity.ErrItemHasHardReservation):
		api.SendError(c, http.StatusConflict, err.Error())
	case errors.Is(err, entity.ErrItemArchived),
		errors.Is(err, entity.ErrTitleRequired),
		errors.Is(err, entity.ErrTitleTooLong),
		errors.Is(err, entity.ErrDescriptionTooLong),
		errors.Is(err, entity.ErrInvalidItemStatus),
		errors.Is(err, entity.ErrCategoryNotFound):
		api.SendError(c, http.StatusUnprocessableEntity, err.Error())
	default:
		api.SendError(c, http.StatusInternalServerError, "internal server error")
	}
}

func newItemResponse(item *entity.Item) itemResponse {
	return itemResponse{
		ID:          item.ID,
		OwnerUserID: item.OwnerUserID.String(),
		Title:       item.Title,
		Description: item.Description,
		CategoryID:  item.CategoryID,
		Status:      string(item.Status),
		CreatedAt:   item.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:   item.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func currentUserID(c *gin.Context) (uuid.UUID, bool) {
	userID, ok := middleware.UserID(c)
	if !ok {
		api.SendError(c, http.StatusUnauthorized, "authentication is required")
		return uuid.Nil, false
	}
	return userID, true
}

func pathID(c *gin.Context) (int64, bool) {
	itemID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || itemID <= 0 {
		api.SendError(c, http.StatusUnprocessableEntity, "id must be a positive integer")
		return 0, false
	}
	return itemID, true
}

// queryInt читает необязательный integer query-параметр. Отсутствующий параметр
// возвращает fallback без ошибки; нечисловое значение — ошибка 422.
func queryInt(c *gin.Context, name string, fallback int) (int, bool) {
	raw := c.Query(name)
	if raw == "" {
		return fallback, true
	}

	value, err := strconv.Atoi(raw)
	if err != nil {
		api.SendError(c, http.StatusUnprocessableEntity, name+" must be an integer")
		return 0, false
	}

	return value, true
}
