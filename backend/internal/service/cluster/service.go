// Package cluster реализует правила актуализации кластеров предложений.
package cluster

import (
	"context"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/database"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

// Service определяет, в какой кластер должно попасть предложение.
type Service struct {
	repository Repository
}

// NewService создаёт сервис кластеризации.
func NewService(repository Repository) *Service {
	return &Service{repository: repository}
}

// Synchronize удаляет старое членство предложения и добавляет его в кластер,
// найденный по embeddings отдаваемого и желаемого товаров.
func (s *Service) Synchronize(ctx context.Context, tx database.Tx, offerID int64) error {
	vectors, err := s.repository.LoadVectors(ctx, tx, offerID)
	if err != nil {
		return err
	}

	oldClusterID, err := s.repository.DeleteMembership(ctx, tx, offerID)
	if err != nil {
		return err
	}
	if oldClusterID != nil {
		if err := s.repository.Refresh(ctx, tx, *oldClusterID); err != nil {
			return err
		}
	}

	clusterID, err := s.repository.FindCandidateCluster(ctx, tx, offerID, vectors)
	if err != nil {
		return err
	}
	if clusterID == nil {
		createdID, err := s.repository.Create(ctx, tx)
		if err != nil {
			return err
		}
		clusterID = &createdID
	}

	if err := s.repository.AddMember(ctx, tx, *clusterID, offerID); err != nil {
		return err
	}
	return s.repository.Refresh(ctx, tx, *clusterID)
}

// Remove исключает предложение из кластера и обновляет либо удаляет кластер.
func (s *Service) Remove(ctx context.Context, tx database.Tx, offerID int64) error {
	clusterID, err := s.repository.DeleteMembership(ctx, tx, offerID)
	if err != nil || clusterID == nil {
		return err
	}
	return s.repository.Refresh(ctx, tx, *clusterID)
}

// ListActiveMembers возвращает реальные ACTIVE-предложения кластера для
// дальнейшей проверки совместимости сервисами цепочек и замен.
func (s *Service) ListActiveMembers(ctx context.Context, clusterID int64) ([]entity.ExchangeOffer, error) {
	return s.repository.ListActiveMembers(ctx, clusterID)
}
