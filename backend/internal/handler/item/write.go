package item

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/api"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"

	itemservice "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/item"
)

func (h *Handler) Create(c *gin.Context) {
	ownerID, ok := api.CurrentUserUUID(c)
	if !ok {
		return
	}

	var body createItemRequest
	if !api.BindJSON(c, &body) {
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

func (h *Handler) Update(c *gin.Context) {
	userID, ok := api.CurrentUserUUID(c)
	if !ok {
		return
	}

	itemID, ok := api.PathInt64(c, "id")
	if !ok {
		return
	}

	var body updateItemRequest
	if !api.BindJSON(c, &body) {
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
	userID, ok := api.CurrentUserUUID(c)
	if !ok {
		return
	}

	itemID, ok := api.PathInt64(c, "id")
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
	userID, ok := api.CurrentUserUUID(c)
	if !ok {
		return
	}

	itemID, ok := api.PathInt64(c, "id")
	if !ok {
		return
	}

	fileHeader, err := c.FormFile("image")
	if err != nil {
		api.SendError(c, http.StatusUnprocessableEntity, "необходимо прикрепить изображение")
		return
	}

	if fileHeader.Size > maxImageUploadSize {
		api.SendError(c, http.StatusUnprocessableEntity, entity.ErrImageTooLarge.Error())
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		api.SendError(c, http.StatusUnprocessableEntity, "не удалось прочитать файл изображения")
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
