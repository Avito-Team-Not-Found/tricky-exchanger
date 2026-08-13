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
	CurrentPassword         string `json:"currentPassword" validate:"required"`
	NewPassword             string `json:"newPassword" validate:"required,min=8"`
	NewPasswordConfirmation string `json:"newPasswordConfirmation" validate:"required,eqfield=NewPassword"`
}

func (h *Handler) ChangePassword(c *gin.Context) {
	userID, ok := middleware.UserID(c)
	if !ok {
		api.SendError(c, http.StatusUnauthorized, "требуется авторизация")
		return
	}

	var req changePasswordRequest
	if !api.BindJSON(c, &req) {
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
