package embedding

import (
	"context"
	"crypto/sha256"
)

const stubVectorDimension = 384

// StubClient создаёт детерминированный вектор нужной размерности без внешнего API.
// Он предназначен только для локальной проверки CRUD до подключения настоящего
// сервиса embeddings; семантического сравнения текстов не выполняет.
type StubClient struct{}

// NewStubClient создаёт локальный клиент-заглушку для embeddings.
func NewStubClient() *StubClient {
	return &StubClient{}
}

// Embed возвращает детерминированный вектор размерности 384 для переданного текста.
func (c *StubClient) Embed(_ context.Context, text string) ([]float32, error) {
	sum := sha256.Sum256([]byte(text))
	vector := make([]float32, stubVectorDimension)
	for i := range vector {
		vector[i] = float32(sum[i%len(sum)]^byte(i*31))/127.5 - 1
	}
	return vector, nil
}

var _ Client = (*StubClient)(nil)
