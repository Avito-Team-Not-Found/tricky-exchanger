package exchange_offer

import (
	"context"
	"fmt"
	"strings"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/database"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/infrastructure/embedding"
	clusterservice "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/cluster"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/matching"
)

// CreateInput содержит данные для создания заявки на обмен.
type CreateInput struct {
	OfferedItemID     int64
	WantedDescription string
}

// UpdateInput содержит новые данные и ожидаемую версию для изменения заявки.
type UpdateInput struct {
	OfferedItemID     int64
	WantedDescription string
	Version           int64
}

// Service реализует сценарии работы с заявками без привязки к HTTP.
// Идентификатор аутентифицированного пользователя передаёт вызывающий код.
type Service struct {
	repository   ExchangeOfferRepository
	embedding    embedding.Client
	matching     matching.Facade
	clusters     *clusterservice.Service
	transactions database.TransactionManager
}

// NewService создаёт сервис заявок с зависимостями для хранения, embeddings и matching.
func NewService(
	repository ExchangeOfferRepository,
	embeddingClient embedding.Client,
	matchingFacade matching.Facade,
	clusterService *clusterservice.Service,
	transactionManager database.TransactionManager,
) *Service {
	return &Service{
		repository:   repository,
		embedding:    embeddingClient,
		matching:     matchingFacade,
		clusters:     clusterService,
		transactions: transactionManager,
	}
}

// Create создаёт активную заявку, получает embedding желания и запускает matching.
func (s *Service) Create(ctx context.Context, userID string, input CreateInput) (entity.ExchangeOffer, error) {
	if err := validateCreate(input); err != nil {
		return entity.ExchangeOffer{}, err
	}

	embeddingValue, err := s.embedWanted(ctx, input.WantedDescription)
	if err != nil {
		return entity.ExchangeOffer{}, err
	}

	if s.transactions == nil || s.clusters == nil {
		return entity.ExchangeOffer{}, entity.ErrClusterNotConfigured
	}

	var created entity.ExchangeOffer
	err = s.transactions.WithinTransaction(ctx, func(tx database.Tx) error {
		var createErr error
		created, createErr = s.repository.Create(ctx, tx, entity.ExchangeOffer{
			UserID:            userID,
			OfferedItemID:     input.OfferedItemID,
			WantedDescription: strings.TrimSpace(input.WantedDescription),
			WantEmbedding:     embeddingValue,
			Status:            entity.RequestStatusActive,
			Version:           1,
		})
		if createErr != nil {
			return createErr
		}
		return s.clusters.Synchronize(ctx, tx, created.ID)
	})
	if err != nil {
		return entity.ExchangeOffer{}, err
	}

	if s.matching == nil {
		return created, entity.ErrMatchingNotConfigured
	}

	if err := s.matching.RebuildForRequest(ctx, created.ID); err != nil {
		return created, fmt.Errorf("request was saved but matching failed: %w", err)
	}

	return created, nil
}

// Get возвращает доступную пользователю заявку по её идентификатору.
func (s *Service) Get(ctx context.Context, userID string, requestID int64) (entity.ExchangeOffer, error) {
	return s.repository.Get(ctx, userID, requestID)
}

// List возвращает все неархивные заявки пользователя.
func (s *Service) List(ctx context.Context, userID string) ([]entity.ExchangeOfferListItem, error) {
	return s.repository.List(ctx, userID)
}

// Update изменяет заявку, повышает её версию в репозитории и запускает matching.
func (s *Service) Update(ctx context.Context, userID string, requestID int64, input UpdateInput) (entity.ExchangeOffer, error) {
	if err := validateUpdate(input); err != nil {
		return entity.ExchangeOffer{}, err
	}

	embeddingValue, err := s.embedWanted(ctx, input.WantedDescription)
	if err != nil {
		return entity.ExchangeOffer{}, err
	}

	if s.transactions == nil || s.clusters == nil {
		return entity.ExchangeOffer{}, entity.ErrClusterNotConfigured
	}

	var updated entity.ExchangeOffer
	err = s.transactions.WithinTransaction(ctx, func(tx database.Tx) error {
		var updateErr error
		updated, updateErr = s.repository.Update(ctx, tx, entity.ExchangeOffer{
			ID:                requestID,
			UserID:            userID,
			OfferedItemID:     input.OfferedItemID,
			WantedDescription: strings.TrimSpace(input.WantedDescription),
			WantEmbedding:     embeddingValue,
		}, input.Version)
		if updateErr != nil {
			return updateErr
		}
		return s.clusters.Synchronize(ctx, tx, updated.ID)
	})
	if err != nil {
		return entity.ExchangeOffer{}, err
	}

	if s.matching == nil {
		return updated, entity.ErrMatchingNotConfigured
	}

	if err := s.matching.RebuildForRequest(ctx, updated.ID); err != nil {
		return updated, fmt.Errorf("request was updated but matching failed: %w", err)
	}

	return updated, nil
}

// Delete архивирует заявку и удаляет её из производных данных matching.
func (s *Service) Delete(ctx context.Context, userID string, requestID, version int64) error {
	if version <= 0 {
		return entity.ErrInvalidVersion
	}

	if s.transactions == nil || s.clusters == nil {
		return entity.ErrClusterNotConfigured
	}

	var archived entity.ExchangeOffer
	err := s.transactions.WithinTransaction(ctx, func(tx database.Tx) error {
		var archiveErr error
		archived, archiveErr = s.repository.Archive(ctx, tx, userID, requestID, version)
		if archiveErr != nil {
			return archiveErr
		}
		return s.clusters.Remove(ctx, tx, archived.ID)
	})
	if err != nil {
		return err
	}

	if s.matching == nil {
		return entity.ErrMatchingNotConfigured
	}

	if err := s.matching.RemoveRequest(ctx, archived.ID); err != nil {
		return fmt.Errorf("request was archived but matching cleanup failed: %w", err)
	}

	return nil
}

func (s *Service) embedWanted(ctx context.Context, description string) ([]float32, error) {
	if s.embedding == nil {
		return nil, entity.ErrEmbeddingNotConfigured
	}

	prompt := strings.TrimSpace(description)

	result, err := s.embedding.Embed(ctx, prompt)
	if err != nil {
		return nil, fmt.Errorf("embed wanted description: %w", err)
	}
	if len(result) == 0 {
		return nil, entity.ErrEmptyEmbedding
	}

	return result, nil
}
