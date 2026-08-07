// Package api содержит общие для всех фич хелперы отправки HTTP-ответа.
//
// Формат ошибок единый для всего бэкенда (см. PROJECT.md §7.3):
//
//	{"error": "человекочитаемое сообщение", "code": 400}
package api

import "github.com/gin-gonic/gin"

type errorResponse struct {
	Error string `json:"error"`
	Code  int    `json:"code"`
}

// SendError отправляет клиенту ошибку в едином формате и прерывает цепочку хендлеров.
func SendError(c *gin.Context, status int, message string) {
	c.AbortWithStatusJSON(status, errorResponse{Error: message, Code: status})
}

// SendOk отправляет клиенту успешный ответ с заданным HTTP-статусом.
func SendOk(c *gin.Context, status int, data any) {
	c.JSON(status, data)
}
