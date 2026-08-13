// Package router собирает HTTP-роутер приложения.
//
// По мере готовности фич их Handler'ы добавляются явными параметрами в New
// (по аналогии с pingH ниже), а маршруты регистрируются в теле функции —
// это единственное место, которое нужно менять, чтобы подключить новые ручки.
package router

import (
	"net/http"

	"github.com/gin-gonic/gin"

	chainHandler "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/handler/chain"
	exchangeOfferHandler "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/handler/exchange_offer"
	itemHandler "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/handler/item"
	userHandler "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/handler/user"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/middleware"
)

func New(
	tokenParser middleware.TokenParser,
	pingH *PingHandler,
	userH *userHandler.Handler,
	exchangeOfferH *exchangeOfferHandler.Handler,
	itemH *itemHandler.Handler,
	chainH *chainHandler.Handler,
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
			exchangeOffers.GET("/:id/exchange-options", chainH.ExchangeOptions)
			exchangeOffers.GET("/:id", exchangeOfferH.Get)
			exchangeOffers.PUT("/:id", exchangeOfferH.Update)
			exchangeOffers.DELETE("/:id", exchangeOfferH.Delete)
		}

		items := api.Group("/items")
		items.Use(middleware.Auth(tokenParser))
		{
			items.POST("", itemH.Create)
			items.GET("", itemH.List)
			items.GET("/:id", itemH.Get)
			items.PATCH("/:id", itemH.Update)
			items.DELETE("/:id", itemH.Archive)
			items.POST("/:id/image", itemH.UploadImage)
		}

		chains := api.Group("/chains")
		chains.Use(middleware.Auth(tokenParser))
		{
			chains.GET("", chainH.List)
			chains.GET("/:id", chainH.Get)
			chains.PUT("/:id/votes", chainH.Vote)
			chains.DELETE("/:id/votes", chainH.WithdrawVote)
			chains.POST("/:id/confirm", chainH.Confirm)
			chains.POST("/:id/unconfirm", chainH.Unconfirm)
			chains.POST("/:id/think", chainH.Think)
			chains.POST("/:id/decline", chainH.Decline)
			chains.GET("/:id/replacements", chainH.ListReplacements)
			chains.PUT("/:id/replacement", chainH.SelectReplacement)
			chains.POST("/:id/receipt", chainH.ConfirmReceipt)
		}

		// Handoff callback (MVP без внешней auth; перед продом — защита).
		integrations := api.Group("/integrations")
		integrations.POST("/avito/handoffs", chainH.Handoff)

		// recovery без JWT: пользователь ещё не залогинен
		recovery := api.Group("/account/password-recovery")
		recovery.POST("/send-code/", userH.SendRecoveryCode)
		recovery.POST("/verify-code/", userH.VerifyRecoveryCode)
		recovery.POST("/reset-password/", userH.ResetPassword)
	}

	return engine
}
