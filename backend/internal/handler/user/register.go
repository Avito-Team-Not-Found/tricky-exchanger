package user

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/api"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

type registerRequest struct {
	FullName string `json:"fullName" binding:"required"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8"`
}

type userResponse struct {
	ID       string `json:"id"`
	FullName string `json:"fullName"`
	Email    string `json:"email"`
}

type registerResponse struct {
	Token string       `json:"token"`
	User  userResponse `json:"user"`
}

// Register godoc — POST /api/v1/auth/register (PROJECT.md §4.1).
// Регистрирует нового пользователя и сразу создаёт для него сессию.
func (h *Handler) Register(c *gin.Context) {
	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		api.SendError(c, http.StatusBadRequest, "некорректные данные регистрации")
		return
	}

	user, token, err := h.service.Register(c.Request.Context(), req.FullName, req.Email, req.Password)
	if err != nil {
		switch {
		case errors.Is(err, entity.ErrUserAlreadyExists):
			api.SendError(c, http.StatusConflict, "пользователь с таким email уже зарегистрирован")
		default:
			api.SendError(c, http.StatusInternalServerError, "внутренняя ошибка сервера")
		}
		return
	}

	api.SendOk(c, http.StatusCreated, registerResponse{
		Token: token,
		User: userResponse{
			ID:       user.ID.String(),
			FullName: user.FullName,
			Email:    user.Email,
		},
	})
}
