package user

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/api"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

type loginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// Login godoc — POST /api/v1/auth/login (PROJECT.md §4.1).
func (h *Handler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		api.SendError(c, http.StatusBadRequest, "некорректные данные входа")
		return
	}

	user, token, err := h.service.Login(c.Request.Context(), req.Email, req.Password)
	if err != nil {
		switch {
		case errors.Is(err, entity.ErrInvalidCredentials):
			api.SendError(c, http.StatusUnauthorized, "неверный email или пароль")
		default:
			api.SendError(c, http.StatusInternalServerError, "внутренняя ошибка сервера")
		}
		return
	}

	api.SendOk(c, http.StatusOK, sessionResponse{
		Token: token,
		User: userResponse{
			ID:       user.ID.String(),
			FullName: user.FullName,
			Email:    user.Email,
		},
	})
}
