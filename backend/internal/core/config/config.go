package config

import (
	"fmt"
	"os"
)

// Config содержит конфигурацию подключения к БД.
type Config struct {
	DatabaseURL string
	ServerPort  string
}

// Load читает конфигурацию из переменных окружения.
func Load() (*Config, error) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	serverPort := os.Getenv("SERVER_PORT")
	if serverPort == "" {
		serverPort = "8080"
	}

	return &Config{
		DatabaseURL: dbURL,
		ServerPort:  serverPort,
	}, nil
}
