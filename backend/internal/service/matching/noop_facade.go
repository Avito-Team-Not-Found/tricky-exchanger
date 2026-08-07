package matching

import "context"

// NoopFacade временно подтверждает синхронный вызов matching без пересчёта данных.
// Он нужен, чтобы локально проверить CRUD заявок до реализации кластеризации и
// поиска цепочек. В рабочей версии его нужно заменить настоящим фасадом.
type NoopFacade struct{}

// NewNoopFacade создаёт временную заглушку matching.
func NewNoopFacade() *NoopFacade {
	return &NoopFacade{}
}

// RebuildForRequest не выполняет пересчёт в режиме заглушки.
func (f *NoopFacade) RebuildForRequest(_ context.Context, _ int64) error {
	return nil
}

// RemoveRequest не выполняет очистку производных данных в режиме заглушки.
func (f *NoopFacade) RemoveRequest(_ context.Context, _ int64) error {
	return nil
}

var _ Facade = (*NoopFacade)(nil)
