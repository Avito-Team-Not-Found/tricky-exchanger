package matching

import (
	"context"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/database"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

// ClusterSynchronizer описывает часть matching, отвечающую за актуальное
// членство заявки в кластере.
type ClusterSynchronizer interface {
	Synchronize(ctx context.Context, tx database.Tx, offerID int64) error
	Remove(ctx context.Context, tx database.Tx, offerID int64) error
}

// MatchingFacade связывает CRUD заявок с производными данными matching.
// Поиск и сохранение цепочек будет добавлен сюда после реализации CycleFinder.
type MatchingFacade struct {
	clusters ClusterSynchronizer
}

// NewFacade создаёт рабочий matching-фасад.
func NewFacade(clusters ClusterSynchronizer) *MatchingFacade {
	return &MatchingFacade{clusters: clusters}
}

// RebuildForRequest синхронно актуализирует производные данные заявки.
func (f *MatchingFacade) RebuildForRequest(ctx context.Context, tx database.Tx, requestID int64) error {
	if f.clusters == nil {
		return entity.ErrClusterNotConfigured
	}
	return f.clusters.Synchronize(ctx, tx, requestID)
}

// RemoveRequest удаляет заявку из производных данных matching.
func (f *MatchingFacade) RemoveRequest(ctx context.Context, tx database.Tx, requestID int64) error {
	if f.clusters == nil {
		return entity.ErrClusterNotConfigured
	}
	return f.clusters.Remove(ctx, tx, requestID)
}
