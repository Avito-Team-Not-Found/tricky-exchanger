// Package storage содержит инфраструктурный клиент объектного хранилища (MinIO,
// S3-совместимое API) — используется для загрузки фото товаров.
package storage

import (
	"context"
	"fmt"
	"io"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// Config — параметры подключения к MinIO (см. internal/core/config).
type Config struct {
	Endpoint  string
	AccessKey string
	SecretKey string
	Bucket    string
	UseSSL    bool
}

// Storage — S3-совместимое объектное хранилище для фото товаров.
// Реализует internal/service/item.Storage.
type Storage struct {
	client *minio.Client
	bucket string
	// publicBaseURL — то, что подставляется в начало возвращаемого URL.
	// Для дефолтной схемы (без CDN/reverse-proxy) это просто эндпоинт MinIO.
	publicBaseURL string
}

// New создаёт клиент MinIO и гарантирует существование бакета (на случай локального
// запуска бэкенда без сервиса minio-init из docker-compose).
func New(ctx context.Context, cfg Config) (*Storage, error) {
	client, err := minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("minio client init: %w", err)
	}

	exists, err := client.BucketExists(ctx, cfg.Bucket)
	if err != nil {
		return nil, fmt.Errorf("minio bucket check: %w", err)
	}
	if !exists {
		if err := client.MakeBucket(ctx, cfg.Bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, fmt.Errorf("minio bucket create: %w", err)
		}
	}

	// Фото товаров отдаются напрямую по URL (например, в <img src>), поэтому бакет
	// должен разрешать анонимное чтение объектов. На запись это не влияет — она
	// всё равно возможна только с access/secret key.
	if err := client.SetBucketPolicy(ctx, cfg.Bucket, publicReadPolicy(cfg.Bucket)); err != nil {
		return nil, fmt.Errorf("minio bucket policy: %w", err)
	}

	scheme := "http"
	if cfg.UseSSL {
		scheme = "https"
	}

	return &Storage{
		client:        client,
		bucket:        cfg.Bucket,
		publicBaseURL: fmt.Sprintf("%s://%s/%s", scheme, cfg.Endpoint, cfg.Bucket),
	}, nil
}

// publicReadPolicy — стандартная bucket policy для анонимного чтения всех объектов бакета.
func publicReadPolicy(bucket string) string {
	return fmt.Sprintf(`{
		"Version": "2012-10-17",
		"Statement": [
			{
				"Effect": "Allow",
				"Principal": {"AWS": ["*"]},
				"Action": ["s3:GetObject"],
				"Resource": ["arn:aws:s3:::%s/*"]
			}
		]
	}`, bucket)
}

// Upload загружает файл в бакет и возвращает публичный URL объекта.
func (s *Storage) Upload(ctx context.Context, objectName string, content io.Reader, size int64, contentType string) (string, error) {
	_, err := s.client.PutObject(ctx, s.bucket, objectName, content, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return "", fmt.Errorf("minio put object: %w", err)
	}

	return fmt.Sprintf("%s/%s", s.publicBaseURL, objectName), nil
}
