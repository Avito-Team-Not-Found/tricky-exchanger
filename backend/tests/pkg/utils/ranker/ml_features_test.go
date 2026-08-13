package ranker_test

import (
	"math"
	"testing"
	"time"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/pkg/utils/ranker"
)

func TestExtractMLFeaturesUsesFormulaSubset(t *testing.T) {
	now := time.Date(2026, 8, 13, 15, 0, 0, 0, time.UTC)
	s := ranker.ChainState{
		Count:                   2,
		Stage:                   ranker.ChainStateCandidate,
		Event:                   ranker.EventAdd,
		EdgeCosines:             []float64{0.5, -0.5},
		ParticipantReliability:  []float64{0.8, 0.6},
		ParticipantClusterSizes: []int{4, 2},
		ApprovedVotes:           0,
		Now:                     now,
		CreatedAt:               now.Add(-2 * time.Hour),
		StageEnteredAt:          now.Add(-2 * time.Hour),
		OfferedCategories:       []string{"phones", "laptops"},
		WantedCategories:        []string{"laptops", "phones"},
		CategoryCounts:          map[string]int{"phones": 40, "laptops": 10},
		CategoryTotal:           100,
	}
	cfg := ranker.NewRankerConfig()
	extracted, err := ranker.ExtractFeatures(s, cfg)
	if err != nil {
		t.Fatal(err)
	}
	ml, err := ranker.ExtractMLFeatures(s, cfg)
	if err != nil {
		t.Fatal(err)
	}
	if ml["match_mean"] != extracted.Match {
		t.Fatalf("match_mean %v != ranker.ExtractFeatures.Match %v", ml["match_mean"], extracted.Match)
	}
	if ml["reliability_mean"] != extracted.Reliability {
		t.Fatalf("reliability_mean mismatch")
	}
	if ml["liquidity_min"] != extracted.Liquidity {
		t.Fatalf("liquidity_min mismatch")
	}
	if math.Abs(ml["hours_since_created"]-2) > 1e-9 {
		t.Fatalf("hours_since_created = %v, want 2", ml["hours_since_created"])
	}
	if ml["category_diversity"] != 1 {
		t.Fatalf("category_diversity = %v, want 1", ml["category_diversity"])
	}
	wantPop := (0.4 + 0.1) / 2
	if math.Abs(ml["category_popularity"]-wantPop) > 1e-12 {
		t.Fatalf("category_popularity = %v, want %v", ml["category_popularity"], wantPop)
	}
}

func TestApplyContextFillsZeroCreatedAt(t *testing.T) {
	now := time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC)
	s := ranker.ApplyContext(ranker.ChainState{Count: 2}, ranker.ContextSnapshot{
		OfferedCategories: []string{"phones", "laptops"},
		WantedCategories:  []string{"laptops", "phones"},
		CategoryTotal:     10,
		CategoryCounts:    map[string]int{"phones": 4},
	}, now)
	if s.CreatedAt != now || s.StageEnteredAt != now {
		t.Fatalf("timestamps = %v / %v, want %v", s.CreatedAt, s.StageEnteredAt, now)
	}
	if reasons := ranker.SparseChainStateReasons(s); len(reasons) != 0 {
		t.Fatalf("sparse reasons = %v", reasons)
	}
}
