package config

import (
	"fmt"
	"os"
)

// Config содержит конфигурацию подключения к БД.
type Config struct {
	DatabaseURL string
}

// Load читает конфигурацию из переменных окружения.
func Load() (*Config, error) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	return &Config{
		DatabaseURL: dbURL,
	}, nil
}