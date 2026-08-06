package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/config"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/database"
	appLogger "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/logger"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/router"
)

func main() {
	// Загружаем .env (не ошибка, если файла нет — переменные могут быть в окружении)
	_ = godotenv.Load()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	logger := appLogger.New(cfg.LogLevel)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Подключаемся к БД; при недоступной БД — понятная ошибка
	pool, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Fatalf("db connect error: %v", err)
	}
	defer pool.Close()
	logger.Info("connected to PostgreSQL, pgvector OK")

	// Точка расширения: по мере готовности фич сюда добавляются их Handler'ы
	// явными параметрами (см. router.New).
	pingHandler := router.NewPingHandler()
	engine := router.New(pingHandler)

	srv := &http.Server{
		Addr:         ":" + cfg.ServerPort,
		Handler:      engine,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Infof("HTTP server listening on %s", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
			return
		}
		errCh <- nil
	}()

	select {
	case <-ctx.Done():
		logger.Info("shutdown signal received")
	case err := <-errCh:
		if err != nil {
			logger.Errorf("HTTP server error: %v", err)
		}
		stop()
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Errorf("HTTP server shutdown error: %v", err)
	}

	logger.Info("exited cleanly")
}
