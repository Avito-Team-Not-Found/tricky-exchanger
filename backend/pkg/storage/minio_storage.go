// Package storage — MinIO/S3 для фото товаров.
package storage

import (
	"context"
	"fmt"
	"io"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type Config struct {
	Endpoint       string // S3 внутри сети, напр. minio:9000
	AccessKey      string
	SecretKey      string
	Bucket         string
	UseSSL         bool
	PublicEndpoint string // база для image_url в браузере; пусто = Endpoint
	// PublicUseSSL отдельно от UseSSL: внутри сети HTTP, снаружи часто HTTPS (Caddy).
	// nil = как UseSSL.
	PublicUseSSL *bool
}

type Storage struct {
	client        *minio.Client
	bucket        string
	publicBaseURL string
}

// New — клиент + CreateBucket если нет (локальный запуск без minio-init).
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

	// Публичное чтение объектов (img src); запись только с access/secret key.
	if err := client.SetBucketPolicy(ctx, cfg.Bucket, publicReadPolicy(cfg.Bucket)); err != nil {
		return nil, fmt.Errorf("minio bucket policy: %w", err)
	}

	publicUseSSL := cfg.UseSSL
	if cfg.PublicUseSSL != nil {
		publicUseSSL = *cfg.PublicUseSSL
	}

	scheme := "http"
	if publicUseSSL {
		scheme = "https"
	}

	publicEndpoint := cfg.PublicEndpoint
	if publicEndpoint == "" {
		publicEndpoint = cfg.Endpoint
	}

	return &Storage{
		client:        client,
		bucket:        cfg.Bucket,
		publicBaseURL: fmt.Sprintf("%s://%s/%s", scheme, publicEndpoint, cfg.Bucket),
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
