package user

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/api"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/middleware"
)

type registerRequest struct {
	FullName string `json:"fullName" validate:"not_empty,max=100"`
	Email    string `json:"email" validate:"required,email,max=255"`
	Password string `json:"password" validate:"required,min=8"`
}

func (h *Handler) Register(c *gin.Context) {
	var req registerRequest
	if !api.BindJSON(c, &req) {
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

	api.SendOk(c, http.StatusCreated, sessionResponse{
		Token: token,
		User: userResponse{
			ID:       user.ID.String(),
			FullName: user.FullName,
			Email:    user.Email,
		},
	})
}

type loginRequest struct {
	Email    string `json:"email" validate:"required,email,max=255"`
	Password string `json:"password" validate:"required"`
}

func (h *Handler) Login(c *gin.Context) {
	var req loginRequest
	if !api.BindJSON(c, &req) {
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

// Logout — JWT стейтлесс: сервер только валидирует токен (отзыв не храним).
func (h *Handler) Logout(c *gin.Context) {
	if _, ok := middleware.UserID(c); !ok {
		api.SendError(c, http.StatusUnauthorized, "требуется авторизация")
		return
	}

	api.SendOk(c, http.StatusOK, gin.H{"message": "logged_out"})
}

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
