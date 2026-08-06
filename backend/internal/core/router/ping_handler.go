package router

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// PingHandler — тестовая ручка каркаса, служит smoke-test'ом того, что
// сервер и роутинг подняты корректно. Удалить, когда появится первая
// настоящая фича.
type PingHandler struct{}

func NewPingHandler() *PingHandler {
	return &PingHandler{}
}

func (h *PingHandler) Ping(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"message": "pong",
	})
}
