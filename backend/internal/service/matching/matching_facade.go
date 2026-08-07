package matching

import "context"

// Facade — синхронная граница между CRUD заявок и подсистемой matching.
// Он обновляет членство заявки в кластерах и пересчитывает кандидатные цепочки.
type Facade interface {
	RebuildForRequest(ctx context.Context, requestID int64) error
	RemoveRequest(ctx context.Context, requestID int64) error
}
