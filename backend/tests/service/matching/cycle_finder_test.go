package matching_test

import (
	"context"
	"testing"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/database"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/matching"
)

func TestCycleFinderReturnsCyclesOfLengthTwoToFive(t *testing.T) {
	for length := 2; length <= 5; length++ {
		t.Run(cycleTestName(length), func(t *testing.T) {
			loader := linearCycleLoader(length)
			finder := matching.NewCycleFinder(loader, 20, 10, 0.5)

			drafts, err := finder.Find(context.Background(), nil, 1)
			if err != nil {
				t.Fatalf("Find() error = %v", err)
			}
			if len(drafts) != 1 {
				t.Fatalf("draft count = %d, want 1", len(drafts))
			}
			if len(drafts[0].Participants) != length {
				t.Fatalf("participant count = %d, want %d", len(drafts[0].Participants), length)
			}
			for position, participant := range drafts[0].Participants {
				wantClusterID := int64(position + 101)
				if participant.ClusterID != wantClusterID {
					t.Fatalf("position %d cluster = %d, want %d", position, participant.ClusterID, wantClusterID)
				}
			}
		})
	}
}

func TestCycleFinderExcludesRepeatedRequest(t *testing.T) {
	loader := &fakeFrontierLoader{
		outgoing: map[int64][]entity.CandidateEdge{
			1: {edge(1, 101, 2, 102, 0.9)},
			2: {edge(2, 102, 3, 103, 0.9)},
			3: {edge(3, 103, 2, 102, 0.9)},
		},
		closers: []entity.CandidateEdge{edge(3, 103, 1, 101, 0.9)},
	}
	finder := matching.NewCycleFinder(loader, 20, 10, 0.5)

	drafts, err := finder.Find(context.Background(), nil, 1)
	if err != nil {
		t.Fatalf("Find() error = %v", err)
	}
	if len(drafts) != 1 {
		t.Fatalf("draft count = %d, want 1", len(drafts))
	}
	assertUniqueParticipants(t, drafts[0])
}

func TestCycleFinderDoesNotAppendSameClusterTwice(t *testing.T) {
	loader := &fakeFrontierLoader{
		outgoing: map[int64][]entity.CandidateEdge{
			1: {edge(1, 101, 2, 102, 0.9)},
			2: {edge(2, 102, 3, 102, 0.9)},
		},
		closers: []entity.CandidateEdge{edge(3, 102, 1, 101, 0.9)},
	}
	finder := matching.NewCycleFinder(loader, 20, 10, 0.5)

	drafts, err := finder.Find(context.Background(), nil, 1)
	if err != nil {
		t.Fatalf("Find() error = %v", err)
	}
	if len(drafts) != 1 {
		t.Fatalf("draft count = %d, want one cluster cycle", len(drafts))
	}
	if len(drafts[0].Participants) != 2 {
		t.Fatalf("cluster count = %d, want 2", len(drafts[0].Participants))
	}
	if drafts[0].Participants[0].ClusterID != 101 || drafts[0].Participants[1].ClusterID != 102 {
		t.Fatalf("clusters = %#v, want [101, 102]", drafts[0].Participants)
	}
}

func TestCycleFinderReturnsEmptyWhenCycleIsMissing(t *testing.T) {
	loader := &fakeFrontierLoader{
		outgoing: map[int64][]entity.CandidateEdge{
			1: {edge(1, 101, 2, 102, 0.9)},
		},
	}
	finder := matching.NewCycleFinder(loader, 20, 10, 0.5)

	drafts, err := finder.Find(context.Background(), nil, 1)
	if err != nil {
		t.Fatalf("Find() error = %v", err)
	}
	if len(drafts) != 0 {
		t.Fatalf("drafts = %#v, want empty result", drafts)
	}
}

// он возвращает ВСЕ уникальные цепочки. Здесь два разных цикла: через 102 и через 103.
func TestCycleFinderReturnsAllUniqueDrafts(t *testing.T) {
	loader := &fakeFrontierLoader{
		outgoing: map[int64][]entity.CandidateEdge{
			1: {
				edge(1, 101, 2, 102, 0.7),
				edge(1, 101, 3, 103, 0.9),
			},
		},
		closers: []entity.CandidateEdge{
			edge(2, 102, 1, 101, 0.7),
			edge(3, 103, 1, 101, 0.9),
		},
	}
	finder := matching.NewCycleFinder(loader, 20, 10, 0.5)

	drafts, err := finder.Find(context.Background(), nil, 1)
	if err != nil {
		t.Fatalf("Find() error = %v", err)
	}
	if len(drafts) != 2 {
		t.Fatalf("draft count = %d, want all 2 unique cycles", len(drafts))
	}
	secondClusters := make(map[int64]bool)
	for _, draft := range drafts {
		if len(draft.Participants) != 2 {
			t.Fatalf("cycle = %#v, want 2 participants", draft.Participants)
		}
		secondClusters[draft.Participants[1].ClusterID] = true
	}
	if !secondClusters[102] || !secondClusters[103] {
		t.Fatalf("cycles through clusters = %v, want both 102 and 103", secondClusters)
	}
}

func TestCycleFinderTreatsRequestsOfOneClusterAsOneVertex(t *testing.T) {
	loader := &fakeFrontierLoader{
		outgoing: map[int64][]entity.CandidateEdge{
			1: {
				edge(1, 101, 3, 103, 0.92),
				edge(1, 101, 4, 103, 0.90),
			},
		},
		closers: []entity.CandidateEdge{
			edge(3, 103, 1, 101, 0.93),
			edge(4, 103, 1, 101, 0.91),
		},
	}
	finder := matching.NewCycleFinder(loader, 20, 10, 0.5)

	drafts, err := finder.Find(context.Background(), nil, 1)
	if err != nil {
		t.Fatalf("Find() error = %v", err)
	}
	if len(drafts) != 1 {
		t.Fatalf("draft count = %d, want one cluster cycle", len(drafts))
	}
	if got := drafts[0].Participants[1].ClusterID; got != 103 {
		t.Fatalf("second vertex cluster = %d, want 103", got)
	}
}

func TestCycleFinderLoadsEachFrontierAsBatch(t *testing.T) {
	loader := &fakeFrontierLoader{
		outgoing: map[int64][]entity.CandidateEdge{
			1: {
				edge(1, 101, 2, 102, 0.9),
				edge(1, 101, 3, 103, 0.9),
			},
			2: {edge(2, 102, 4, 104, 0.9)},
			3: {edge(3, 103, 5, 105, 0.9)},
		},
		closers: []entity.CandidateEdge{
			edge(4, 104, 1, 101, 0.9),
			edge(5, 105, 1, 101, 0.9),
		},
	}
	finder := matching.NewCycleFinder(loader, 20, 10, 0.5)

	if _, err := finder.Find(context.Background(), nil, 1); err != nil {
		t.Fatalf("Find() error = %v", err)
	}
	if len(loader.frontiers) < 2 {
		t.Fatalf("frontier calls = %v, want at least two levels", loader.frontiers)
	}
	if len(loader.frontiers[1]) != 2 || loader.frontiers[1][0] != 2 || loader.frontiers[1][1] != 3 {
		t.Fatalf("second frontier = %v, want [2 3] in one call", loader.frontiers[1])
	}
}

func linearCycleLoader(length int) *fakeFrontierLoader {
	loader := &fakeFrontierLoader{outgoing: make(map[int64][]entity.CandidateEdge)}
	for requestID := 1; requestID < length; requestID++ {
		from := int64(requestID)
		to := int64(requestID + 1)
		loader.outgoing[from] = []entity.CandidateEdge{
			edge(from, from+100, to, to+100, 0.9),
		}
	}
	last := int64(length)
	loader.closers = []entity.CandidateEdge{edge(last, last+100, 1, 101, 0.9)}
	return loader
}

func cycleTestName(length int) string {
	return map[int]string{2: "length_2", 3: "length_3", 4: "length_4", 5: "length_5"}[length]
}

func edge(fromRequestID, fromClusterID, toRequestID, toClusterID int64, score float64) entity.CandidateEdge {
	return entity.CandidateEdge{
		FromRequestID: fromRequestID,
		FromClusterID: fromClusterID,
		ToRequestID:   toRequestID,
		ToClusterID:   toClusterID,
		Score:         score,
	}
}

func assertUniqueParticipants(t *testing.T, draft entity.ChainDraft) {
	t.Helper()
	clusters := make(map[int64]bool)
	for _, participant := range draft.Participants {
		if clusters[participant.ClusterID] {
			t.Fatalf("cluster %d appears more than once", participant.ClusterID)
		}
		clusters[participant.ClusterID] = true
	}
}

type fakeFrontierLoader struct {
	outgoing  map[int64][]entity.CandidateEdge
	closers   []entity.CandidateEdge
	frontiers [][]int64
}

func (l *fakeFrontierLoader) LoadOutgoingFrontier(
	_ context.Context,
	_ database.Tx,
	requestIDs []int64,
	_ int,
	_ float64,
) ([]entity.CandidateEdge, error) {
	l.frontiers = append(l.frontiers, append([]int64(nil), requestIDs...))
	edges := make([]entity.CandidateEdge, 0)
	for _, requestID := range requestIDs {
		edges = append(edges, l.outgoing[requestID]...)
	}
	return edges, nil
}

func (l *fakeFrontierLoader) LoadIncomingToStart(
	_ context.Context,
	_ database.Tx,
	_ int64,
	_ int,
	_ float64,
) ([]entity.CandidateEdge, error) {
	return l.closers, nil
}
