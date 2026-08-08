// Package item содержит HTTP-обработчики CRUD товаров.
package item

import (
	"encoding/json"
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
	"github.com/Avito-Team-Not-Found/tricky-exchanger/pkg/validator"
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
	Title       string `json:"title" validate:"not_empty,max=200"`
	Description string `json:"description" validate:"omitempty,max=2000"`
	Category    string `json:"category" validate:"omitempty,max=100"`
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

func (h *Handler) Create(c *gin.Context) {
	ownerID, ok := currentUserID(c)
	if !ok {
		return
	}

	var body createItemRequest
	if err := validator.BindJSON(&body, c.Request); err != nil {
		var jsonSyntaxErr *json.SyntaxError
		if errors.As(err, &jsonSyntaxErr) {
			api.SendError(c, http.StatusBadRequest, "invalid JSON")
			return
		}
		api.SendError(c, http.StatusUnprocessableEntity, err.Error())
		return
	}

	created, err := h.service.Create(c.Request.Context(), ownerID, itemservice.CreateInput{
		Title:       body.Title,
		Description: body.Description,
		Category:    body.Category,
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

	var query listItemsQuery
	if err := validator.BindQuery(&query, c.Request); err != nil {
		api.SendError(c, http.StatusUnprocessableEntity, err.Error())
		return
	}
	page, pageSize := itemservice.NormalizePagination(query.Page, query.PageSize)

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
	if err := validator.BindJSON(&body, c.Request); err != nil {
		var jsonSyntaxErr *json.SyntaxError
		if errors.As(err, &jsonSyntaxErr) {
			api.SendError(c, http.StatusBadRequest, "invalid JSON")
			return
		}
		api.SendError(c, http.StatusUnprocessableEntity, err.Error())
		return
	}

	updated, err := h.service.Update(c.Request.Context(), userID, itemID, itemservice.UpdateInput{
		Title:       body.Title,
		Description: body.Description,
		Category:    body.Category,
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

// UploadImage принимает multipart-форму с полем "image" и сохраняет фото товара
// в объектном хранилище. Допустимые типы: jpeg/png/webp, максимальный размер — 5 МиБ.
func (h *Handler) UploadImage(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		return
	}

	itemID, ok := pathID(c)
	if !ok {
		return
	}

	fileHeader, err := c.FormFile("image")
	if err != nil {
		api.SendError(c, http.StatusUnprocessableEntity, "image file is required")
		return
	}

	if fileHeader.Size > maxImageUploadSize {
		api.SendError(c, http.StatusUnprocessableEntity, entity.ErrImageTooLarge.Error())
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		api.SendError(c, http.StatusUnprocessableEntity, "unable to read image file")
		return
	}
	defer file.Close()

	contentType := fileHeader.Header.Get("Content-Type")

	updated, err := h.service.UploadImage(c.Request.Context(), userID, itemID, file, fileHeader.Size, contentType)
	if err != nil {
		writeItemError(c, err)
		return
	}

	api.SendOk(c, http.StatusOK, newItemResponse(updated))
}

// maxImageUploadSize — тот же лимит, что и в service/item, продублирован здесь,
// чтобы отклонять слишком большие файлы ещё до чтения их в память.
const maxImageUploadSize = 5 << 20

func writeItemError(c *gin.Context, err error) {
	var ve validator.Error
	switch {
	case errors.As(err, &ve):
		api.SendError(c, http.StatusUnprocessableEntity, err.Error())
	case errors.Is(err, entity.ErrItemNotFound), errors.Is(err, entity.ErrItemForbidden):
		// Чужой и несуществующий товар неразличимы для клиента — не подтверждаем
		// существование чужих товаров.
		api.SendError(c, http.StatusNotFound, "item not found")
	case errors.Is(err, entity.ErrItemHasHardReservation):
		api.SendError(c, http.StatusConflict, err.Error())
	case errors.Is(err, entity.ErrItemArchived),
		errors.Is(err, entity.ErrInvalidItemStatus),
		errors.Is(err, entity.ErrInvalidImageType),
		errors.Is(err, entity.ErrImageTooLarge):
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
		Category:    item.Category,
		ImageURL:    item.ImageURL,
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

