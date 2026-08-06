// Package router собирает HTTP-роутер приложения.
//
// По мере готовности фич их Handler'ы добавляются явными параметрами в New
// (по аналогии с pingH ниже), а маршруты регистрируются в теле функции —
// это единственное место, которое нужно менять, чтобы подключить новые ручки.
package router

import (
	"net/http"

	"github.com/gin-gonic/gin"

	userHandler "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/handler/user"
)

// New создаёт gin.Engine и регистрирует маршруты приложения.
func New(pingH *PingHandler, userH *userHandler.Handler) *gin.Engine {
	engine := gin.New()
	engine.Use(gin.Logger())
	engine.Use(gin.Recovery())

	// info
	engine.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	api := engine.Group("/api/v1")
	{
		// ping — тестовая ручка каркаса, удалить с появлением первой настоящей фичи
		api.GET("/ping", pingH.Ping)

		// auth
		auth := api.Group("/auth")
		auth.POST("/register", userH.Register)

		// сюда команда добавляет маршруты своих фич по мере готовности, например:
		//
		// products
		// api.GET("/products", itemH.List)
		// api.POST("/products", itemH.Create)
	}

	return engine
}
