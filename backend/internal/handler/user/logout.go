package user

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/api"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/middleware"
)

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
