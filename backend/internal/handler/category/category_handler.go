// Package category содержит HTTP-обработчики справочника категорий.
package category

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/api"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/middleware"
)

// Handler обрабатывает HTTP-запросы справочника категорий.
type Handler struct {
	service categoryService
}

func NewHandler(service categoryService) *Handler {
	return &Handler{service: service}
}

type categoryResponse struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// List возвращает весь справочник категорий. Требует аутентификации.
func (h *Handler) List(c *gin.Context) {
	if _, ok := currentUserID(c); !ok {
		return
	}

	categories, err := h.service.List(c.Request.Context())
	if err != nil {
		api.SendError(c, http.StatusInternalServerError, "internal server error")
		return
	}

	response := make([]categoryResponse, 0, len(categories))
	for _, cat := range categories {
		response = append(response, newCategoryResponse(cat))
	}

	api.SendOk(c, http.StatusOK, response)
}

func newCategoryResponse(cat entity.Category) categoryResponse {
	return categoryResponse{
		ID:   strconv.FormatInt(cat.ID, 10),
		Name: cat.Name,
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