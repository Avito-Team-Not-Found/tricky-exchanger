package user

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/api"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/middleware"
)

type changePasswordRequest struct {
	CurrentPassword         string `json:"currentPassword" binding:"required"`
	NewPassword             string `json:"newPassword" binding:"required,min=8"`
	NewPasswordConfirmation string `json:"newPasswordConfirmation" binding:"required"`
}

// ChangePassword godoc — POST /api/v1/auth/change-password (PROJECT.md §4.1).
// Требует Authorization: Bearer <jwt>. Это смена пароля для уже залогиненного
// пользователя — не путать с восстановлением пароля по коду с почты.
func (h *Handler) ChangePassword(c *gin.Context) {
	userID, ok := middleware.UserID(c)
	if !ok {
		api.SendError(c, http.StatusUnauthorized, "требуется авторизация")
		return
	}

	var req changePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		api.SendError(c, http.StatusBadRequest, "некорректные данные для смены пароля")
		return
	}
	if req.NewPassword != req.NewPasswordConfirmation {
		api.SendError(c, http.StatusBadRequest, "пароли не совпадают")
		return
	}

	err := h.service.ChangePassword(c.Request.Context(), userID, req.CurrentPassword, req.NewPassword)
	if err != nil {
		switch {
		case errors.Is(err, entity.ErrInvalidCredentials):
			api.SendError(c, http.StatusBadRequest, "неверный текущий пароль")
		case errors.Is(err, entity.ErrUserNotFound):
			api.SendError(c, http.StatusNotFound, "пользователь не найден")
		default:
			api.SendError(c, http.StatusInternalServerError, "внутренняя ошибка сервера")
		}
		return
	}

	api.SendOk(c, http.StatusOK, gin.H{"message": "password_changed"})
}
