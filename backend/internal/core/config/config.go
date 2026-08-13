package config

import (
	"fmt"
	"os"
	"strconv"
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

	// Embedding* — настройки генерации векторов желания (TEI).
	// Provider: "tei" | "stub" | "" (пусто = stub для локальной разработки без TEI).
	EmbeddingProvider string
	TEIURL            string
	VectorDim         int
	EmbeddingTimeout  time.Duration
	MaxInputLength    int
	// MinIO* — настройки объектного хранилища для фото товаров (см. internal/infrastructure/storage).
	// MinIOEndpoint — адрес для S3-клиента внутри докер-сети (например, "minio:9000").
	// MinIOPublicEndpoint — адрес, который попадает в image_url и должен открываться
	// в браузере с хост-машины (например, "localhost:9000", т.к. порт MinIO пробрасывается наружу).
	MinIOEndpoint       string
	MinIOPublicEndpoint string
	MinIOAccessKey      string
	MinIOSecretKey      string
	MinIOBucket         string
	MinIOUseSSL         bool
	// MinIOPublicUseSSL — схема публичных image_url (через Caddy HTTPS).
	// Если env не задан, совпадает с MinIOUseSSL.
	MinIOPublicUseSSL bool

	// Matching* — настройки векторного поиска кандидатов (задача SCRUM-24).
	// pgvector даёт только Top-/пороговых семантических кандидатов; поиск циклов и
	// кластеры строятся уже поверх них в Go. Параметры меняются через окружение.
	MatchingTopK           int     // LIMIT для Top-K рёбер графа (default 20)
	MatchingThreshold      float64 // порог cosine для рёбер want→item (default 0.5)
	ClusterTopK            int     // LIMIT кандидатов при кластеризации (default 50)
	ClusterThreshold       float64 // порог «то же направление» offer+want (default 0.9)
	ClusterDirectionMargin float64 // запас прямого сходства над обратным без категории
	VectorMetric           string  // "cosine" (зафиксировано, соответствует индексу)
	CycleOutgoingK         int     // максимум исходящих рёбер одной вершины
	CycleMaxDrafts         int     // максимум возвращаемых вариантов цепочки
	CycleMinAverageScore   float64 // минимальное среднее качество стрелок цикла
	CycleMaxScoreGap       float64 // допустимая разница между лучшей и худшей стрелкой

	// Ranker* — скоринг цепочек: LightGBM (дефолт) или formula (явный baseline).
	RankerMode      string
	RankerModelPath string
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

	rankerMode, err := ParseRankerMode(os.Getenv("RANKER_MODE"))
	if err != nil {
		return nil, err
	}

	vectorDim, err := envIntOrDefault("VECTOR_DIM", 384)
	if err != nil {
		return nil, err
	}
	embeddingTimeout, err := envDurationOrDefault("EMBEDDING_TIMEOUT", 2*time.Second)
	if err != nil {
		return nil, err
	}
	maxInputLength, err := envIntOrDefault("MAX_INPUT_LENGTH", 1500)
	if err != nil {
		return nil, err
	}
	matchingTopK, err := envIntOrDefault("MATCHING_TOPK", 20)
	if err != nil {
		return nil, err
	}
	matchingThreshold, err := envFloatOrDefault("MATCHING_THRESHOLD", 0.5)
	if err != nil {
		return nil, err
	}
	clusterTopK, err := envIntOrDefault("CLUSTER_TOPK", 50)
	if err != nil {
		return nil, err
	}
	clusterThreshold, err := envFloatOrDefault("CLUSTER_SIMILARITY_THRESHOLD", 0.9)
	if err != nil {
		return nil, err
	}
	clusterDirectionMargin, err := envFloatOrDefault("CLUSTER_DIRECTION_MARGIN", 0.05)
	if err != nil {
		return nil, err
	}
	cycleOutgoingK, err := envIntOrDefault("CYCLE_OUTGOING_K", 20)
	if err != nil {
		return nil, err
	}
	cycleMaxDrafts, err := envIntOrDefault("CYCLE_MAX_DRAFTS", 10)
	if err != nil {
		return nil, err
	}
	cycleMinAverageScore, err := envFloatOrDefault("CYCLE_MIN_AVERAGE_SCORE", 0.5)
	if err != nil {
		return nil, err
	}
	cycleMaxScoreGap, err := envFloatOrDefault("CYCLE_MAX_SCORE_GAP", 1)
	if err != nil {
		return nil, err
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

		EmbeddingProvider: envOrDefault("EMBEDDING_PROVIDER", "stub"),
		TEIURL:            envOrDefault("TEI_URL", "http://tei:80"),
		VectorDim:         vectorDim,
		EmbeddingTimeout:  embeddingTimeout,
		MaxInputLength:    maxInputLength,

		MatchingTopK:           matchingTopK,
		MatchingThreshold:      matchingThreshold,
		ClusterTopK:            clusterTopK,
		ClusterThreshold:       clusterThreshold,
		ClusterDirectionMargin: clusterDirectionMargin,
		VectorMetric:           envOrDefault("VECTOR_METRIC", "cosine"),
		CycleOutgoingK:         cycleOutgoingK,
		CycleMaxDrafts:         cycleMaxDrafts,
		CycleMinAverageScore:   cycleMinAverageScore,
		CycleMaxScoreGap:       cycleMaxScoreGap,

		RankerMode:      rankerMode,
		RankerModelPath: envOrDefault("RANKER_MODEL_PATH", "pkg/utils/ranker/models/ranker_v1.txt"),

		MinIOEndpoint:       envOrDefault("MINIO_ENDPOINT", "localhost:9000"),
		MinIOPublicEndpoint: envOrDefault("MINIO_PUBLIC_ENDPOINT", "localhost:9000"),
		MinIOAccessKey:      envOrDefault("MINIO_ACCESS_KEY", ""),
		MinIOSecretKey:      envOrDefault("MINIO_SECRET_KEY", ""),
		MinIOBucket:         envOrDefault("MINIO_BUCKET", "items"),
		MinIOUseSSL:         envOrDefault("MINIO_USE_SSL", "false") == "true",
		MinIOPublicUseSSL:   envOrDefault("MINIO_PUBLIC_USE_SSL", envOrDefault("MINIO_USE_SSL", "false")) == "true",
	}, nil
}

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// envIntOrDefault возвращает fallback только если переменная не задана.
// Невалидное значение — ошибка старта.
func envIntOrDefault(key string, fallback int) (int, error) {
	v := os.Getenv(key)
	if v == "" {
		return fallback, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return 0, fmt.Errorf("%s=%q is not a valid int: %w", key, v, err)
	}
	return n, nil
}

// envDurationOrDefault — как envIntOrDefault, для time.Duration.
func envDurationOrDefault(key string, fallback time.Duration) (time.Duration, error) {
	v := os.Getenv(key)
	if v == "" {
		return fallback, nil
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return 0, fmt.Errorf("%s=%q is not a valid duration: %w", key, v, err)
	}
	return d, nil
}

// envFloatOrDefault — как envIntOrDefault, для float64.
func envFloatOrDefault(key string, fallback float64) (float64, error) {
	v := os.Getenv(key)
	if v == "" {
		return fallback, nil
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return 0, fmt.Errorf("%s=%q is not a valid float: %w", key, v, err)
	}
	return f, nil
}

const (
	RankerModeFormula = "formula"
	RankerModeML      = "ml"
)

// ParseRankerMode принимает formula|ml; пустое значение → ml.
// Неизвестное значение — ошибка (fail-fast на старте).
func ParseRankerMode(v string) (string, error) {
	switch v {
	case "", RankerModeML:
		return RankerModeML, nil
	case RankerModeFormula:
		return RankerModeFormula, nil
	default:
		return "", fmt.Errorf("RANKER_MODE must be formula or ml, got %q", v)
	}
}
