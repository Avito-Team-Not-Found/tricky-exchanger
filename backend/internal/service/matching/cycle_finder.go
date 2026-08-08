package matching

import (
	"context"
	"sort"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/database"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

const (
	minCycleLength        = 2
	maxCycleLength        = 5
	defaultOutgoingK      = 20
	defaultMaxCycleDraft  = 10
	defaultCycleThreshold = 0.5
)

// FrontierLoader описывает пакетные PostgreSQL-запросы, нужные CycleFinder.
// Интерфейс объявлен здесь, у потребителя; repository/search предоставляет реализацию.
type FrontierLoader interface {
	LoadOutgoingFrontier(
		ctx context.Context,
		tx database.Tx,
		requestIDs []int64,
		k int,
		threshold float64,
	) ([]entity.CandidateEdge, error)
	LoadIncomingToStart(
		ctx context.Context,
		tx database.Tx,
		startRequestID int64,
		k int,
		threshold float64,
	) ([]entity.CandidateEdge, error)
}

// CycleFinder строит локальный граф вокруг одной заявки и ищет в нём простые циклы.
type CycleFinder struct {
	loader    FrontierLoader
	outgoingK int
	maxDrafts int
	threshold float64
}

// NewCycleFinder создаёт поиск циклов с безопасными значениями по умолчанию.
func NewCycleFinder(loader FrontierLoader, outgoingK, maxDrafts int, threshold float64) *CycleFinder {
	if outgoingK <= 0 {
		outgoingK = defaultOutgoingK
	}
	if maxDrafts <= 0 {
		maxDrafts = defaultMaxCycleDraft
	}
	if threshold <= 0 || threshold > 1 {
		threshold = defaultCycleThreshold
	}
	return &CycleFinder{
		loader:    loader,
		outgoingK: outgoingK,
		maxDrafts: maxDrafts,
		threshold: threshold,
	}
}

// Find возвращает лучшие простые циклы длиной 2–5, начинающиеся со startRequestID.
// Отсутствие подходящих циклов является штатным результатом, а не ошибкой.
func (f *CycleFinder) Find(ctx context.Context, tx database.Tx, startRequestID int64) ([]entity.ChainDraft, error) {
	if f.loader == nil || startRequestID <= 0 {
		return []entity.ChainDraft{}, nil
	}

	closingEdges, err := f.loader.LoadIncomingToStart(
		ctx,
		tx,
		startRequestID,
		f.outgoingK,
		f.threshold,
	)
	if err != nil {
		return nil, err
	}

	closers, startClusterID := f.indexClosers(startRequestID, closingEdges)
	if len(closers) == 0 || startClusterID == 0 {
		return []entity.ChainDraft{}, nil
	}

	adjacency, err := f.loadLocalGraph(ctx, tx, startRequestID)
	if err != nil {
		return nil, err
	}
	if len(adjacency[startRequestID]) == 0 {
		return []entity.ChainDraft{}, nil
	}

	path := []entity.ChainDraftParticipant{{
		ClusterID: startClusterID,
		RequestID: startRequestID,
	}}
	visitedRequests := map[int64]bool{startRequestID: true}
	visitedClusters := map[int64]bool{startClusterID: true}
	drafts := make([]entity.ChainDraft, 0, f.maxDrafts)

	var dfs func(currentRequestID int64, edgeScoreSum float64)
	dfs = func(currentRequestID int64, edgeScoreSum float64) {
		if len(path) >= minCycleLength {
			currentClusterID := path[len(path)-1].ClusterID
			if closing, ok := closers[currentRequestID]; ok && closing.FromClusterID == currentClusterID {
				draft := entity.ChainDraft{
					Participants: append([]entity.ChainDraftParticipant(nil), path...),
					Score:        (edgeScoreSum + closing.Score) / float64(len(path)),
				}
				drafts = keepBestDrafts(drafts, draft, f.maxDrafts)
			}
		}

		if len(path) == maxCycleLength {
			return
		}

		for _, edge := range adjacency[currentRequestID] {
			currentClusterID := path[len(path)-1].ClusterID
			if edge.FromRequestID != currentRequestID ||
				edge.FromClusterID != currentClusterID ||
				edge.ToRequestID == startRequestID ||
				visitedRequests[edge.ToRequestID] ||
				visitedClusters[edge.ToClusterID] {
				continue
			}

			visitedRequests[edge.ToRequestID] = true
			visitedClusters[edge.ToClusterID] = true
			path = append(path, entity.ChainDraftParticipant{
				ClusterID: edge.ToClusterID,
				RequestID: edge.ToRequestID,
			})

			dfs(edge.ToRequestID, edgeScoreSum+edge.Score)

			path = path[:len(path)-1]
			delete(visitedRequests, edge.ToRequestID)
			delete(visitedClusters, edge.ToClusterID)
		}
	}

	dfs(startRequestID, 0)
	sortDrafts(drafts)
	return drafts, nil
}

func (f *CycleFinder) indexClosers(
	startRequestID int64,
	edges []entity.CandidateEdge,
) (map[int64]entity.CandidateEdge, int64) {
	closers := make(map[int64]entity.CandidateEdge, len(edges))
	var startClusterID int64

	for _, edge := range edges {
		if edge.ToRequestID != startRequestID ||
			edge.FromRequestID == startRequestID ||
			edge.FromClusterID == 0 ||
			edge.ToClusterID == 0 ||
			edge.FromClusterID == edge.ToClusterID ||
			edge.Score < f.threshold {
			continue
		}
		if startClusterID == 0 {
			startClusterID = edge.ToClusterID
		}
		if edge.ToClusterID != startClusterID {
			continue
		}
		if previous, exists := closers[edge.FromRequestID]; !exists || edge.Score > previous.Score {
			closers[edge.FromRequestID] = edge
		}
	}
	return closers, startClusterID
}

func (f *CycleFinder) loadLocalGraph(
	ctx context.Context,
	tx database.Tx,
	startRequestID int64,
) (map[int64][]entity.CandidateEdge, error) {
	adjacency := make(map[int64][]entity.CandidateEdge)
	frontier := []int64{startRequestID}
	expanded := make(map[int64]bool)

	// Четырёх раскрытий frontier достаточно для путей из пяти заявок.
	for level := 0; level < maxCycleLength-1 && len(frontier) > 0; level++ {
		sources := make([]int64, 0, len(frontier))
		sourceSet := make(map[int64]bool, len(frontier))
		for _, requestID := range frontier {
			if expanded[requestID] || sourceSet[requestID] {
				continue
			}
			sources = append(sources, requestID)
			sourceSet[requestID] = true
		}
		if len(sources) == 0 {
			break
		}

		edges, err := f.loader.LoadOutgoingFrontier(ctx, tx, sources, f.outgoingK, f.threshold)
		if err != nil {
			return nil, err
		}

		nextFrontier := make([]int64, 0, len(edges))
		nextSeen := make(map[int64]bool, len(edges))
		edgeSeen := make(map[[2]int64]bool, len(edges))
		for _, edge := range edges {
			if !sourceSet[edge.FromRequestID] ||
				edge.FromRequestID == edge.ToRequestID ||
				edge.FromClusterID == 0 ||
				edge.ToClusterID == 0 ||
				edge.FromClusterID == edge.ToClusterID ||
				edge.Score < f.threshold {
				continue
			}

			key := [2]int64{edge.FromRequestID, edge.ToRequestID}
			if edgeSeen[key] {
				continue
			}
			edgeSeen[key] = true
			adjacency[edge.FromRequestID] = append(adjacency[edge.FromRequestID], edge)

			if edge.ToRequestID != startRequestID && !expanded[edge.ToRequestID] && !nextSeen[edge.ToRequestID] {
				nextSeen[edge.ToRequestID] = true
				nextFrontier = append(nextFrontier, edge.ToRequestID)
			}
		}

		for _, requestID := range sources {
			expanded[requestID] = true
			sort.SliceStable(adjacency[requestID], func(i, j int) bool {
				if adjacency[requestID][i].Score != adjacency[requestID][j].Score {
					return adjacency[requestID][i].Score > adjacency[requestID][j].Score
				}
				return adjacency[requestID][i].ToRequestID < adjacency[requestID][j].ToRequestID
			})
		}
		frontier = nextFrontier
	}

	return adjacency, nil
}

func keepBestDrafts(drafts []entity.ChainDraft, candidate entity.ChainDraft, limit int) []entity.ChainDraft {
	drafts = append(drafts, candidate)
	sortDrafts(drafts)
	if len(drafts) > limit {
		drafts = drafts[:limit]
	}
	return drafts
}

func sortDrafts(drafts []entity.ChainDraft) {
	sort.SliceStable(drafts, func(i, j int) bool {
		if drafts[i].Score != drafts[j].Score {
			return drafts[i].Score > drafts[j].Score
		}
		if len(drafts[i].Participants) != len(drafts[j].Participants) {
			return len(drafts[i].Participants) < len(drafts[j].Participants)
		}
		for position := range drafts[i].Participants {
			left := drafts[i].Participants[position].RequestID
			right := drafts[j].Participants[position].RequestID
			if left != right {
				return left < right
			}
		}
		return false
	})
}
