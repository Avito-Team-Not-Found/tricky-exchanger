package user

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/api"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/middleware"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/pkg/validator"
)

// Handler — HTTP-обработчики фичи "пользователи" (регистрация, вход и т.д.).
type Handler struct {
	service Service
}

func NewHandler(service Service) *Handler {
	return &Handler{service: service}
}

// userResponse — публичное представление пользователя, общее для всех ручек фичи.
type userResponse struct {
	ID       string `json:"id"`
	FullName string `json:"fullName"`
	Email    string `json:"email"`
}

// sessionResponse — ответ ручек, создающих сессию (register, login).
type sessionResponse struct {
	Token string       `json:"token"`
	User  userResponse `json:"user"`
}

type registerRequest struct {
	FullName string `json:"fullName" validate:"not_empty,max=100"`
	Email    string `json:"email" validate:"required,email,max=255"`
	Password string `json:"password" validate:"required,min=8"`
}

// Register godoc — POST /api/v1/auth/register (PROJECT.md §4.1).
// Регистрирует нового пользователя и сразу создаёт для него сессию.
func (h *Handler) Register(c *gin.Context) {
	var req registerRequest
	if err := validator.BindJSON(&req, c.Request); err != nil {
		var jsonSyntaxErr *json.SyntaxError
		if errors.As(err, &jsonSyntaxErr) {
			api.SendError(c, http.StatusBadRequest, "некорректный JSON")
			return
		}
		api.SendError(c, http.StatusUnprocessableEntity, err.Error())
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

// Login godoc — POST /api/v1/auth/login (PROJECT.md §4.1).
func (h *Handler) Login(c *gin.Context) {
	var req loginRequest
	if err := validator.BindJSON(&req, c.Request); err != nil {
		var jsonSyntaxErr *json.SyntaxError
		if errors.As(err, &jsonSyntaxErr) {
			api.SendError(c, http.StatusBadRequest, "некорректный JSON")
			return
		}
		api.SendError(c, http.StatusUnprocessableEntity, err.Error())
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

// Logout godoc — POST /api/v1/auth/logout (PROJECT.md §4.1). Требует Authorization: Bearer <jwt>.
//
// Сессии в этом MVP — стейтлесс JWT без хранилища/blacklist токенов, поэтому
// сервер не может принудительно инвалидировать уже выданный токен: он просто
// живёт до истечения TTL. Ручка существует, чтобы у клиента был единый способ
// завершить сессию (плюс сама удаляет токен из localStorage, см. PROJECT.md §4.1) —
// сервер только подтверждает, что запрос пришёл с валидным токеном.
func (h *Handler) Logout(c *gin.Context) {
	if _, ok := middleware.UserID(c); !ok {
		api.SendError(c, http.StatusUnauthorized, "требуется авторизация")
		return
	}

	api.SendOk(c, http.StatusOK, gin.H{"message": "logged_out"})
}

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

type changePasswordRequest struct {
	CurrentPassword         string `json:"currentPassword" validate:"required"`
	NewPassword             string `json:"newPassword" validate:"required,min=8"`
	NewPasswordConfirmation string `json:"newPasswordConfirmation" validate:"required,eqfield=NewPassword"`
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
	if err := validator.BindJSON(&req, c.Request); err != nil {
		var jsonSyntaxErr *json.SyntaxError
		if errors.As(err, &jsonSyntaxErr) {
			api.SendError(c, http.StatusBadRequest, "некорректный JSON")
			return
		}
		api.SendError(c, http.StatusUnprocessableEntity, err.Error())
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

// Восстановление пароля (PROJECT.md §4.1) — три незащищённых ручки:
// send-code (email → код на почту) → verify-code (email+код, чисто UX-проверка)
// → reset-password (email+код+новый пароль, финальная и единственная авторитетная проверка кода).
// Это отдельный флоу от ChangePassword: там пользователь уже залогинен и меняет
// пароль по текущему паролю, здесь — восстанавливает доступ по коду с почты.

type sendRecoveryCodeRequest struct {
	Email string `json:"email" validate:"required,email,max=255"`
}

// SendRecoveryCode godoc — POST /api/v1/account/password-recovery/send-code/.
func (h *Handler) SendRecoveryCode(c *gin.Context) {
	var req sendRecoveryCodeRequest
	if err := validator.BindJSON(&req, c.Request); err != nil {
		var jsonSyntaxErr *json.SyntaxError
		if errors.As(err, &jsonSyntaxErr) {
			api.SendError(c, http.StatusBadRequest, "некорректный JSON")
			return
		}
		api.SendError(c, http.StatusUnprocessableEntity, err.Error())
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

// VerifyRecoveryCode godoc — POST /api/v1/account/password-recovery/verify-code/.
func (h *Handler) VerifyRecoveryCode(c *gin.Context) {
	var req verifyRecoveryCodeRequest
	if err := validator.BindJSON(&req, c.Request); err != nil {
		var jsonSyntaxErr *json.SyntaxError
		if errors.As(err, &jsonSyntaxErr) {
			api.SendError(c, http.StatusBadRequest, "некорректный JSON")
			return
		}
		api.SendError(c, http.StatusUnprocessableEntity, err.Error())
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

// ResetPassword godoc — POST /api/v1/account/password-recovery/reset-password/.
// Повторно (и единственно авторитетно) проверяет код — не полагается на
// предыдущий вызов VerifyRecoveryCode.
func (h *Handler) ResetPassword(c *gin.Context) {
	var req resetPasswordRequest
	if err := validator.BindJSON(&req, c.Request); err != nil {
		var jsonSyntaxErr *json.SyntaxError
		if errors.As(err, &jsonSyntaxErr) {
			api.SendError(c, http.StatusBadRequest, "некорректный JSON")
			return
		}
		api.SendError(c, http.StatusUnprocessableEntity, err.Error())
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
