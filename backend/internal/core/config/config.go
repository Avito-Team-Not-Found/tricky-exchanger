package config

import (
	"fmt"
	"os"
	"time"
)

// jwtTokenTTL — время жизни сессионного JWT (PROJECT.md §3.2: "время жизни токена — 24 часа").
const jwtTokenTTL = 24 * time.Hour

// recoveryCodeTTL — время жизни кода восстановления пароля (PROJECT.md §4.1: "живёт 10 минут").
const recoveryCodeTTL = 10 * time.Minute

// Config содержит конфигурацию приложения.
type Config struct {
	DatabaseURL string
	ServerPort  string
	LogLevel    string
	JWTSecret   string
	JWTTokenTTL time.Duration

	// SMTP* — настройки почтового сервера для отправки кода восстановления пароля.
	// Намеренно не required: без них поднимется весь остальной бэкенд, а сломается
	// только сама отправка письма (see mailer.ErrNotConfigured).
	SMTPHost     string
	SMTPPort     string
	SMTPUsername string
	SMTPPassword string
	SMTPFrom     string
	// SMTPEncryption — "plain" | "starttls" | "tls", см. internal/infrastructure/mailer.
	SMTPEncryption  string
	RecoveryCodeTTL time.Duration

	// MinIO* — настройки объектного хранилища для фото товаров (см. internal/infrastructure/storage).
	MinIOEndpoint  string
	MinIOAccessKey string
	MinIOSecretKey string
	MinIOBucket    string
	MinIOUseSSL    bool
}

// Load читает конфигурацию из переменных окружения.
func Load() (*Config, error) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}

	return &Config{
		DatabaseURL: dbURL,
		ServerPort:  envOrDefault("SERVER_PORT", "8080"),
		LogLevel:    envOrDefault("LOG_LEVEL", "info"),
		JWTSecret:   jwtSecret,
		JWTTokenTTL: jwtTokenTTL,

		SMTPHost:        envOrDefault("SMTP_HOST", ""),
		SMTPPort:        envOrDefault("SMTP_PORT", "587"),
		SMTPUsername:    envOrDefault("SMTP_USERNAME", ""),
		SMTPPassword:    envOrDefault("SMTP_PASSWORD", ""),
		SMTPFrom:        envOrDefault("SMTP_FROM", ""),
		SMTPEncryption:  envOrDefault("SMTP_ENCRYPTION", "starttls"),
		RecoveryCodeTTL: recoveryCodeTTL,

		MinIOEndpoint:  envOrDefault("MINIO_ENDPOINT", "localhost:9000"),
		MinIOAccessKey: envOrDefault("MINIO_ACCESS_KEY", ""),
		MinIOSecretKey: envOrDefault("MINIO_SECRET_KEY", ""),
		MinIOBucket:    envOrDefault("MINIO_BUCKET", "items"),
		MinIOUseSSL:    envOrDefault("MINIO_USE_SSL", "false") == "true",
	}, nil
}

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
