package user

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/api"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/middleware"
)

// Me godoc — GET /api/v1/auth/me (PROJECT.md §4.1). Требует Authorization: Bearer <jwt>.
// Используется фронтендом для восстановления сессии по токену из localStorage.
func (h *Handler) Me(c *gin.Context) {
	userID, ok := middleware.UserID(c)
	if !ok {
		api.SendError(c, http.StatusUnauthorized, "требуется авторизация")
		return
	}

	user, err := h.service.Me(c.Request.Context(), userID)
	if err != nil {
		switch {
		case errors.Is(err, entity.ErrUserNotFound):
			api.SendError(c, http.StatusNotFound, "пользователь не найден")
		default:
			api.SendError(c, http.StatusInternalServerError, "внутренняя ошибка сервера")
		}
		return
	}

	api.SendOk(c, http.StatusOK, userResponse{
		ID:       user.ID.String(),
		FullName: user.FullName,
		Email:    user.Email,
	})
}
