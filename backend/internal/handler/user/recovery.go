package user

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/api"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

// Восстановление пароля (PROJECT.md §4.1) — три незащищённых ручки:
// send-code (email → код на почту) → verify-code (email+код, чисто UX-проверка)
// → reset-password (email+код+новый пароль, финальная и единственная авторитетная проверка кода).
// Это отдельный флоу от ChangePassword: там пользователь уже залогинен и меняет
// пароль по текущему паролю, здесь — восстанавливает доступ по коду с почты.

type sendRecoveryCodeRequest struct {
	Email string `json:"email" binding:"required,email"`
}

// SendRecoveryCode godoc — POST /api/v1/account/password-recovery/send-code/.
func (h *Handler) SendRecoveryCode(c *gin.Context) {
	var req sendRecoveryCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		api.SendError(c, http.StatusBadRequest, "некорректный email")
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
	Email string `json:"email" binding:"required,email"`
	Code  string `json:"code" binding:"required,len=6"`
}

// VerifyRecoveryCode godoc — POST /api/v1/account/password-recovery/verify-code/.
func (h *Handler) VerifyRecoveryCode(c *gin.Context) {
	var req verifyRecoveryCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		api.SendError(c, http.StatusBadRequest, "некорректные email или код")
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
	Email    string `json:"email" binding:"required,email"`
	Code     string `json:"code" binding:"required,len=6"`
	Password string `json:"password" binding:"required,min=8"`
}

// ResetPassword godoc — POST /api/v1/account/password-recovery/reset-password/.
// Повторно (и единственно авторитетно) проверяет код — не полагается на
// предыдущий вызов VerifyRecoveryCode.
func (h *Handler) ResetPassword(c *gin.Context) {
	var req resetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		api.SendError(c, http.StatusBadRequest, "некорректные данные для сброса пароля")
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
