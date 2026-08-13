package search

import (
	"context"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository"
)

// FindOutgoingByThreshold ищет чужие предметы, похожие на want, с порогом подобия.
func (s *Search) FindOutgoingByThreshold(ctx context.Context, want []float32, excludeUserID string, threshold float64) ([]entity.Candidate, error) {
	rows, err := s.pool.Query(ctx, constQueryOutgoingThreshold, embedLiteral(want), excludeUserID, threshold)
	if err != nil {
		if mappedErr, ok := repository.DBErrToErr(err); ok {
			return nil, mappedErr
		}
		return nil, err
	}
	return collectCandidates(rows)
}

// FindIncomingByThreshold ищет чужие заявки, чей want_embedding похож на предмет.
func (s *Search) FindIncomingByThreshold(ctx context.Context, mine []float32, excludeUserID string, threshold float64) ([]entity.Candidate, error) {
	rows, err := s.pool.Query(ctx, constQueryIncomingThreshold, embedLiteral(mine), excludeUserID, threshold)
	if err != nil {
		if mappedErr, ok := repository.DBErrToErr(err); ok {
			return nil, mappedErr
		}
		return nil, err
	}
	return collectCandidates(rows)
}

// FindOutgoingTopK возвращает K лучших чужих предметов, близких к want.
func (s *Search) FindOutgoingTopK(ctx context.Context, want []float32, excludeUserID string, k int) ([]entity.Candidate, error) {
	rows, err := s.pool.Query(ctx, constQueryOutgoingTopK, embedLiteral(want), excludeUserID, k)
	if err != nil {
		if mappedErr, ok := repository.DBErrToErr(err); ok {
			return nil, mappedErr
		}
		return nil, err
	}
	return collectCandidates(rows)
}

// FindIncomingTopK возвращает K лучших чужих заявок, чей want_embedding близок к предмету.
func (s *Search) FindIncomingTopK(ctx context.Context, mine []float32, excludeUserID string, k int) ([]entity.Candidate, error) {
	rows, err := s.pool.Query(ctx, constQueryIncomingTopK, embedLiteral(mine), excludeUserID, k)
	if err != nil {
		if mappedErr, ok := repository.DBErrToErr(err); ok {
			return nil, mappedErr
		}
		return nil, err
	}
	return collectCandidates(rows)
}

// FindSimilarOffers возвращает Top-K ACTIVE-заявок с тем же направлением обмена.
// offer и want передаются как валидные pgvector-литералы, загруженные из БД.
func (s *Search) FindSimilarOffers(
	ctx context.Context,
	offer string,
	want string,
	category string,
	wantedCategory string,
	excludeOfferID int64,
	threshold float64,
	directionMargin float64,
	k int,
) ([]entity.Candidate, error) {
	rows, err := s.pool.Query(
		ctx,
		querySimilarOffers,
		offer,
		want,
		excludeOfferID,
		category,
		wantedCategory,
		threshold,
		k,
		directionMargin,
	)
	if err != nil {
		if mappedErr, ok := repository.DBErrToErr(err); ok {
			return nil, mappedErr
		}
		return nil, err
	}
	return collectCandidates(rows)
}
