package cluster

import (
	"context"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/database"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

// OfferVectors содержит векторы направления обмена конкретного предложения.
type OfferVectors struct {
	OfferEmbedding string
	WantEmbedding  string
}

// Repository описывает SQL-операции, нужные сервису кластеризации.
type Repository interface {
	LoadVectors(ctx context.Context, tx database.Tx, offerID int64) (OfferVectors, error)
	DeleteMembership(ctx context.Context, tx database.Tx, offerID int64) (*int64, error)
	FindCandidateCluster(ctx context.Context, tx database.Tx, offerID int64, vectors OfferVectors) (*int64, error)
	Create(ctx context.Context, tx database.Tx) (int64, error)
	AddMember(ctx context.Context, tx database.Tx, clusterID, offerID int64) error
	Refresh(ctx context.Context, tx database.Tx, clusterID int64) error
	ListActiveMembers(ctx context.Context, clusterID int64) ([]entity.ExchangeOffer, error)
}
