package item

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/api"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/pkg/validator"

	itemservice "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/item"
)

func (h *Handler) Get(c *gin.Context) {
	userID, ok := api.CurrentUserUUID(c)
	if !ok {
		return
	}

	itemID, ok := api.PathInt64(c, "id")
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
	userID, ok := api.CurrentUserUUID(c)
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
		api.SendError(c, http.StatusInternalServerError, "внутренняя ошибка сервера")
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
