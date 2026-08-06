package main

import (
	"context"
	"log"

	"github.com/joho/godotenv"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/config"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/database"
)

func main() {
	// Загружаем .env (не ошибка, если файла нет — переменные могут быть в окружении)
	_ = godotenv.Load()

	ctx := context.Background()

	// Читаем конфигурацию
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	// Подключаемся к БД; при недоступной БД — понятная ошибка
	pool, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db connect error: %v", err)
	}
	defer pool.Close()

	log.Println("connected to PostgreSQL, pgvector OK")
}