package matching_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/database"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/matching"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/pkg/utils/ranker"
)

func sampleState() ranker.ChainState {
	now := time.Date(2026, 8, 13, 12, 0, 0, 0, time.UTC)
	return ranker.ChainState{
		Count:                   2,
		Stage:                   ranker.ChainStateCandidate,
		Event:                   ranker.EventAdd,
		EdgeCosines:             []float64{0.4, 0.6},
		ParticipantReliability:  []float64{0.75, 0.75},
		ParticipantClusterSizes: []int{3, 3},
		ApprovedVotes:           0,
		Now:                     now,
		CreatedAt:               now,
		StageEnteredAt:          now,
		OfferedCategories:       []string{"phones", "laptops"},
		WantedCategories:        []string{"laptops", "phones"},
		CategoryCounts:          map[string]int{"phones": 10, "laptops": 5},
		CategoryTotal:           40,
	}
}

func TestFlagOffIdenticalToFormula(t *testing.T) {
	formula := ranker.NewFormulaRanker(ranker.NewRankerConfig())
	r, err := matching.NewRuntimeRanker(matching.RankerModeFormula, "")
	if err != nil {
		t.Fatal(err)
	}
	s := sampleState()
	want, err := formula.Score(s)
	if err != nil {
		t.Fatal(err)
	}
	got, err := r.Score(s)
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("formula mode score = %v, want %v", got, want)
	}
	if _, isFormula := r.(*ranker.ChainScoreCalculator); !isFormula {
		t.Fatalf("formula mode ranker type = %T, want *ranker.ChainScoreCalculator", r)
	}
}

func TestFailFastOnError(t *testing.T) {
	t.Run("missing model", func(t *testing.T) {
		_, err := matching.NewRuntimeRanker(matching.RankerModeML, filepath.Join(t.TempDir(), "nope.txt"))
		if err == nil {
			t.Fatal("expected init error for missing model")
		}
	})

	t.Run("broken model", func(t *testing.T) {
		broken := filepath.Join(t.TempDir(), "ranker_v1.txt")
		if err := os.WriteFile(broken, []byte("not a lightgbm model\n"), 0o644); err != nil {
			t.Fatal(err)
		}
		_, err := matching.NewRuntimeRanker(matching.RankerModeML, broken)
		if err == nil {
			t.Fatal("expected init error for broken model")
		}
	})

	t.Run("model vs Go feature names mismatch", func(t *testing.T) {
		wrong := filepath.Join(t.TempDir(), "ranker_v1.txt")
		body := "tree\nversion=v3\nfeature_names=count progress\n"
		if err := os.WriteFile(wrong, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
		_, err := matching.NewRuntimeRanker(matching.RankerModeML, wrong)
		if err == nil {
			t.Fatal("expected init error for model vs FeatureNames mismatch")
		}
	})

	t.Run("predict error is not formula fallback", func(t *testing.T) {
		ml, err := matching.NewMLRanker(&errPredictor{err: errors.New("broken model")})
		if err != nil {
			t.Fatal(err)
		}
		formula := ranker.NewFormulaRanker(ranker.NewRankerConfig())
		wantFormula, err := formula.Score(sampleState())
		if err != nil {
			t.Fatal(err)
		}
		got, err := ml.Score(sampleState())
		if err == nil {
			t.Fatal("expected Score error, got formula-style success")
		}
		if got == wantFormula {
			t.Fatalf("got formula score %v on ML error; fallback must not run", got)
		}
		if got != 0 {
			t.Fatalf("error path score = %v, want 0", got)
		}
	})
}

func TestProdChainStateFilled(t *testing.T) {
	created := time.Now().UTC().Add(-4 * time.Hour)
	stage := created.Add(time.Hour)
	snap := ranker.ContextSnapshot{
		CreatedAt:         created,
		StageEnteredAt:    stage,
		VoteTimes:         []time.Time{stage},
		OfferedCategories: []string{"phones", "laptops"},
		WantedCategories:  []string{"laptops", "phones"},
		CategoryCounts:    map[string]int{"phones": 12, "laptops": 8},
		CategoryTotal:     50,
	}
	cap := &capturingRanker{inner: ranker.NewFormulaRanker(ranker.NewRankerConfig())}
	clusters := &fakeClusters{}
	cycles := &fakeCycles{clusters: clusters}
	facade := matching.NewFacade(clusters, cycles, &fakeChains{cycles: cycles}).
		WithRanker(cap).
		WithRankerContextLoader(&fakeRankerLoader{snap: snap})

	if _, err := facade.RebuildForRequest(context.Background(), nil, 11); err != nil {
		t.Fatalf("RebuildForRequest: %v", err)
	}
	got := cap.last
	if got.CreatedAt.IsZero() || got.StageEnteredAt.IsZero() {
		t.Fatalf("timestamps zero: created=%v stage=%v", got.CreatedAt, got.StageEnteredAt)
	}
	if got.CreatedAt.Equal(created) == false {
		t.Fatalf("CreatedAt = %v, want %v", got.CreatedAt, created)
	}
	if len(got.OfferedCategories) == 0 || got.OfferedCategories[0] == "" {
		t.Fatalf("offered categories empty: %v", got.OfferedCategories)
	}
	if len(got.WantedCategories) == 0 || got.WantedCategories[0] == "" {
		t.Fatalf("wanted categories empty: %v", got.WantedCategories)
	}
	if got.CategoryTotal == 0 {
		t.Fatalf("category total is 0")
	}
	feats, err := ranker.ExtractMLFeatures(got, ranker.NewRankerConfig())
	if err != nil {
		t.Fatal(err)
	}
	if feats["hours_since_created"] <= 0 {
		t.Fatalf("hours_since_created = %v, want > 0", feats["hours_since_created"])
	}
	if feats["category_popularity"] <= 0 {
		t.Fatalf("category_popularity = %v, want > 0", feats["category_popularity"])
	}
}

type errPredictor struct {
	err error
}

func (p *errPredictor) Predict(map[string]float64) (float64, error) {
	return 0, p.err
}

type capturingRanker struct {
	inner ranker.Ranker
	last  ranker.ChainState
}

func (c *capturingRanker) Score(s ranker.ChainState) (float64, error) {
	c.last = s
	return c.inner.Score(s)
}

type fakeRankerLoader struct {
	snap ranker.ContextSnapshot
}

func (l *fakeRankerLoader) LoadRankerContextForRequests(
	_ context.Context, _ database.Tx, _ []int64,
) (ranker.ContextSnapshot, error) {
	return l.snap, nil
}
