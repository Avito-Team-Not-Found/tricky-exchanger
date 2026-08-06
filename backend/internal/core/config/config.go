package config

import (
	"fmt"
	"os"
)

// Config содержит конфигурацию приложения.
type Config struct {
	DatabaseURL string
	ServerPort  string
	LogLevel    string
}

// Load читает конфигурацию из переменных окружения.
func Load() (*Config, error) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	return &Config{
		DatabaseURL: dbURL,
		ServerPort:  envOrDefault("SERVER_PORT", "8080"),
		LogLevel:    envOrDefault("LOG_LEVEL", "info"),
	}, nil
}

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
