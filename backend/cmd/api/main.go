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
	appLogger "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/logger"
)

func main() {
	_ = godotenv.Load("../.env")

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	logger := appLogger.New(cfg.LogLevel)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Миграции применяются отдельным шагом до старта приложения (см. docker-compose.yml,
	// сервис migrate) — приложение подключается уже к готовой схеме.
	srv, cleanup, err := buildServer(ctx, cfg, logger)
	if err != nil {
		logger.Fatalf("server build error: %v", err)
	}
	defer cleanup()

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
