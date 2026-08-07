package embedding

import "context"

// Client преобразует текст в вектор pgvector, используемый matching.
// Реализация может обращаться к внешнему сервису, поэтому её вызывают
// до открытия транзакции базы данных.
type Client interface {
	Embed(ctx context.Context, text string) ([]float32, error)
}
