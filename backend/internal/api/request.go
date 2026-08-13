package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/pkg/validator"
)

// UserIDContextKey — ключ gin.Context, куда Auth кладёт uuid.UUID владельца.
const UserIDContextKey = "userID"

// CurrentUserUUID достаёт userID из контекста. При отсутствии — 401.
func CurrentUserUUID(c *gin.Context) (uuid.UUID, bool) {
	v, exists := c.Get(UserIDContextKey)
	if !exists {
		SendError(c, http.StatusUnauthorized, "требуется авторизация")
		return uuid.Nil, false
	}
	id, ok := v.(uuid.UUID)
	if !ok {
		SendError(c, http.StatusUnauthorized, "требуется авторизация")
		return uuid.Nil, false
	}
	return id, true
}

// CurrentUserString — строковый userID для сервисов, где UUID ещё не проведён.
func CurrentUserString(c *gin.Context) (string, bool) {
	id, ok := CurrentUserUUID(c)
	if !ok {
		return "", false
	}
	return id.String(), true
}

// PathInt64 читает положительный int64 path-параметр. При ошибке — 422.
func PathInt64(c *gin.Context, name string) (int64, bool) {
	value, err := strconv.ParseInt(c.Param(name), 10, 64)
	if err != nil || value <= 0 {
		SendError(c, http.StatusUnprocessableEntity, name+" должен быть положительным целым числом")
		return 0, false
	}
	return value, true
}

// BindJSON декодирует и валидирует JSON-тело. false — ответ уже отправлен.
func BindJSON(c *gin.Context, dst any) bool {
	return BindJSONWithInvalidMessage(c, dst, "некорректный JSON")
}

// BindJSONWithInvalidMessage — то же, с кастомным текстом для ошибок декодирования.
func BindJSONWithInvalidMessage(c *gin.Context, dst any, invalidJSONMessage string) bool {
	if err := validator.BindJSON(dst, c.Request); err != nil {
		var ve validator.Error
		if errors.As(err, &ve) {
			SendError(c, http.StatusUnprocessableEntity, err.Error())
			return false
		}
		var jsonSyntaxErr *json.SyntaxError
		if errors.As(err, &jsonSyntaxErr) {
			SendError(c, http.StatusBadRequest, invalidJSONMessage)
			return false
		}
		// Decoder may return io.ErrUnexpectedEOF / plain EOF for truncated JSON.
		SendError(c, http.StatusBadRequest, invalidJSONMessage)
		return false
	}
	return true
}
