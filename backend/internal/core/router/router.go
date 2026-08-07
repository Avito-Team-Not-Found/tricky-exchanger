// Package router собирает HTTP-роутер приложения.
//
// По мере готовности фич их Handler'ы добавляются явными параметрами в New
// (по аналогии с pingH ниже), а маршруты регистрируются в теле функции —
// это единственное место, которое нужно менять, чтобы подключить новые ручки.
package router

import (
	"net/http"

	"github.com/gin-gonic/gin"

	exchangeOfferHandler "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/handler/exchange_offer"
	userHandler "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/handler/user"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/middleware"
)

// New создаёт gin.Engine и регистрирует маршруты приложения.
// tokenParser проверяет JWT для защищённых маршрутов (см. middleware.Auth).
func New(
	tokenParser middleware.TokenParser,
	pingH *PingHandler,
	userH *userHandler.Handler,
	exchangeOfferH *exchangeOfferHandler.Handler,
) *gin.Engine {
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

		// auth — регистрация и вход не защищены, остальное требует Bearer-токен
		auth := api.Group("/auth")
		auth.POST("/register", userH.Register)
		auth.POST("/login", userH.Login)

		authProtected := auth.Group("")
		authProtected.Use(middleware.Auth(tokenParser))
		{
			authProtected.POST("/logout", userH.Logout)
			authProtected.GET("/me", userH.Me)
			authProtected.POST("/change-password", userH.ChangePassword)
		}

		exchangeOffers := api.Group("/exchange-offers")
		exchangeOffers.Use(middleware.Auth(tokenParser))
		{
			exchangeOffers.POST("", exchangeOfferH.Create)
			exchangeOffers.GET("", exchangeOfferH.List)
			exchangeOffers.GET("/:id", exchangeOfferH.Get)
			exchangeOffers.PUT("/:id", exchangeOfferH.Update)
			exchangeOffers.DELETE("/:id", exchangeOfferH.Delete)
		}

		// восстановление пароля по коду с почты — не защищено, пользователь ещё не залогинен
		recovery := api.Group("/account/password-recovery")
		recovery.POST("/send-code/", userH.SendRecoveryCode)
		recovery.POST("/verify-code/", userH.VerifyRecoveryCode)
		recovery.POST("/reset-password/", userH.ResetPassword)

		// сюда команда добавляет маршруты своих фич по мере готовности, например:
		//
		// products
		// api.GET("/products", itemH.List)
		// api.POST("/products", itemH.Create)
	}

	return engine
}
