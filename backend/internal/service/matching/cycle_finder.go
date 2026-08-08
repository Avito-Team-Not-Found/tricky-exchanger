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

type cycleVertex struct {
	clusterID               int64
	representativeRequestID int64
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
	if len(adjacency[startClusterID]) == 0 {
		return []entity.ChainDraft{}, nil
	}

	path := []cycleVertex{{
		clusterID:               startClusterID,
		representativeRequestID: startRequestID,
	}}
	visitedClusters := map[int64]bool{startClusterID: true}
	drafts := make([]entity.ChainDraft, 0, f.maxDrafts)

	var dfs func(currentClusterID int64, edgeScoreSum float64)
	dfs = func(currentClusterID int64, edgeScoreSum float64) {
		if len(path) >= minCycleLength {
			if closing, ok := closers[currentClusterID]; ok {
				participants := make([]entity.ChainDraftParticipant, len(path))
				for position, vertex := range path {
					participants[position] = entity.ChainDraftParticipant{
						ClusterID: vertex.clusterID,
						RequestID: vertex.representativeRequestID,
					}
				}
				draft := entity.ChainDraft{
					Participants: participants,
					Score:        (edgeScoreSum + closing.Score) / float64(len(path)),
				}
				drafts = keepBestDrafts(drafts, draft, f.maxDrafts)
			}
		}

		if len(path) == maxCycleLength {
			return
		}

		for _, edge := range adjacency[currentClusterID] {
			if edge.FromClusterID != currentClusterID ||
				edge.ToRequestID == startRequestID ||
				visitedClusters[edge.ToClusterID] {
				continue
			}

			visitedClusters[edge.ToClusterID] = true
			path = append(path, cycleVertex{
				clusterID:               edge.ToClusterID,
				representativeRequestID: edge.ToRequestID,
			})

			dfs(edge.ToClusterID, edgeScoreSum+edge.Score)

			path = path[:len(path)-1]
			delete(visitedClusters, edge.ToClusterID)
		}
	}

	dfs(startClusterID, 0)
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
		if previous, exists := closers[edge.FromClusterID]; !exists || edge.Score > previous.Score {
			closers[edge.FromClusterID] = edge
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
	expandedClusters := make(map[int64]bool)

	// Четырёх раскрытий frontier достаточно для путей из пяти кластеров.
	for level := 0; level < maxCycleLength-1 && len(frontier) > 0; level++ {
		sources := make([]int64, 0, len(frontier))
		sourceSet := make(map[int64]bool, len(frontier))
		for _, requestID := range frontier {
			if sourceSet[requestID] {
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

		bestEdges := make(map[[2]int64]entity.CandidateEdge, len(edges))
		for _, edge := range edges {
			if !sourceSet[edge.FromRequestID] ||
				edge.FromRequestID == edge.ToRequestID ||
				edge.FromClusterID == 0 ||
				edge.ToClusterID == 0 ||
				edge.FromClusterID == edge.ToClusterID ||
				edge.Score < f.threshold {
				continue
			}

			key := [2]int64{edge.FromClusterID, edge.ToClusterID}
			if previous, exists := bestEdges[key]; !exists || edge.Score > previous.Score {
				bestEdges[key] = edge
			}
		}

		nextByCluster := make(map[int64]entity.CandidateEdge, len(bestEdges))
		for _, edge := range bestEdges {
			if expandedClusters[edge.FromClusterID] {
				continue
			}
			adjacency[edge.FromClusterID] = append(adjacency[edge.FromClusterID], edge)
			if edge.ToRequestID != startRequestID && !expandedClusters[edge.ToClusterID] {
				if previous, exists := nextByCluster[edge.ToClusterID]; !exists || edge.Score > previous.Score {
					nextByCluster[edge.ToClusterID] = edge
				}
			}
		}

		for fromClusterID := range adjacency {
			sort.SliceStable(adjacency[fromClusterID], func(i, j int) bool {
				if adjacency[fromClusterID][i].Score != adjacency[fromClusterID][j].Score {
					return adjacency[fromClusterID][i].Score > adjacency[fromClusterID][j].Score
				}
				return adjacency[fromClusterID][i].ToClusterID < adjacency[fromClusterID][j].ToClusterID
			})
		}

		nextFrontier := make([]int64, 0, len(nextByCluster))
		for _, edge := range nextByCluster {
			nextFrontier = append(nextFrontier, edge.ToRequestID)
		}
		sort.Slice(nextFrontier, func(i, j int) bool { return nextFrontier[i] < nextFrontier[j] })
		for _, edge := range bestEdges {
			expandedClusters[edge.FromClusterID] = true
		}
		frontier = nextFrontier
	}

	return adjacency, nil
}

func keepBestDrafts(drafts []entity.ChainDraft, candidate entity.ChainDraft, limit int) []entity.ChainDraft {
	for i := range drafts {
		if sameClusterPath(drafts[i], candidate) {
			if candidate.Score > drafts[i].Score {
				drafts[i] = candidate
			}
			sortDrafts(drafts)
			return drafts
		}
	}
	drafts = append(drafts, candidate)
	sortDrafts(drafts)
	if len(drafts) > limit {
		drafts = drafts[:limit]
	}
	return drafts
}

func sameClusterPath(left, right entity.ChainDraft) bool {
	if len(left.Participants) != len(right.Participants) {
		return false
	}
	for position := range left.Participants {
		if left.Participants[position].ClusterID != right.Participants[position].ClusterID {
			return false
		}
	}
	return true
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
			left := drafts[i].Participants[position].ClusterID
			right := drafts[j].Participants[position].ClusterID
			if left != right {
				return left < right
			}
		}
		return false
	})
}
