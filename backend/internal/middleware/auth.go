// Package middleware содержит сквозные gin-мидлвари (аутентификация и т.п.),
// не привязанные к конкретной фиче.
package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/api"
)

type TokenParser interface {
	Parse(tokenStr string) (uuid.UUID, error)
}

// Auth проверяет заголовок "Authorization: Bearer <jwt>" и складывает userID
// авторизованного пользователя в gin.Context. При отсутствии/невалидном
// токене отвечает 401 и прерывает цепочку хендлеров.
func Auth(parser TokenParser) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")

		const bearerPrefix = "Bearer "
		if !strings.HasPrefix(authHeader, bearerPrefix) {
			api.SendError(c, http.StatusUnauthorized, "требуется авторизация")
			return
		}

		tokenStr := strings.TrimPrefix(authHeader, bearerPrefix)

		userID, err := parser.Parse(tokenStr)
		if err != nil {
			api.SendError(c, http.StatusUnauthorized, "недействительный или истёкший токен")
			return
		}

		c.Set(api.UserIDContextKey, userID)
		c.Next()
	}
}

// UserID достаёт userID, положенный мидлварью Auth. ok=false означает, что
// мидлварь Auth не применялась к этому маршруту — программная ошибка роутинга.
func UserID(c *gin.Context) (uuid.UUID, bool) {
	v, exists := c.Get(api.UserIDContextKey)
	if !exists {
		return uuid.Nil, false
	}
	id, ok := v.(uuid.UUID)
	return id, ok
}
