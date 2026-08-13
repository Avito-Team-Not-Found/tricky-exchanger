package user

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/api"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

type sendRecoveryCodeRequest struct {
	Email string `json:"email" validate:"required,email,max=255"`
}

func (h *Handler) SendRecoveryCode(c *gin.Context) {
	var req sendRecoveryCodeRequest
	if !api.BindJSON(c, &req) {
		return
	}

	if err := h.service.SendRecoveryCode(c.Request.Context(), req.Email); err != nil {
		switch {
		case errors.Is(err, entity.ErrUserNotFound):
			api.SendError(c, http.StatusNotFound, "пользователь с таким email не найден")
		default:
			api.SendError(c, http.StatusInternalServerError, "не удалось отправить код на почту")
		}
		return
	}

	api.SendOk(c, http.StatusOK, gin.H{"message": "code_sent"})
}

type verifyRecoveryCodeRequest struct {
	Email string `json:"email" validate:"required,email,max=255"`
	Code  string `json:"code" validate:"required,recovery_code"`
}

func (h *Handler) VerifyRecoveryCode(c *gin.Context) {
	var req verifyRecoveryCodeRequest
	if !api.BindJSON(c, &req) {
		return
	}

	if err := h.service.VerifyRecoveryCode(c.Request.Context(), req.Email, req.Code); err != nil {
		switch {
		case errors.Is(err, entity.ErrInvalidRecoveryCode):
			api.SendError(c, http.StatusBadRequest, "неверный или истёкший код")
		default:
			api.SendError(c, http.StatusInternalServerError, "внутренняя ошибка сервера")
		}
		return
	}

	api.SendOk(c, http.StatusOK, gin.H{"message": "code_valid"})
}

type resetPasswordRequest struct {
	Email    string `json:"email" validate:"required,email,max=255"`
	Code     string `json:"code" validate:"required,recovery_code"`
	Password string `json:"password" validate:"required,min=8"`
}

// Повторно (и единственно авторитетно) проверяет код — не полагается на
// предыдущий вызов VerifyRecoveryCode.
func (h *Handler) ResetPassword(c *gin.Context) {
	var req resetPasswordRequest
	if !api.BindJSON(c, &req) {
		return
	}

	err := h.service.ResetPassword(c.Request.Context(), req.Email, req.Code, req.Password)
	if err != nil {
		switch {
		case errors.Is(err, entity.ErrInvalidRecoveryCode):
			api.SendError(c, http.StatusBadRequest, "неверный или истёкший код")
		case errors.Is(err, entity.ErrUserNotFound):
			api.SendError(c, http.StatusNotFound, "пользователь с таким email не найден")
		default:
			api.SendError(c, http.StatusInternalServerError, "внутренняя ошибка сервера")
		}
		return
	}

	api.SendOk(c, http.StatusOK, gin.H{"message": "password_changed"})
}
