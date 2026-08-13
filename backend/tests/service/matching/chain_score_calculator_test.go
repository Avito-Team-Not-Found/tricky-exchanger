package matching_test

import (
	"errors"
	"math"
	"testing"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/pkg/utils/ranker"
)

func newCalc() *ranker.ChainScoreCalculator {
	return ranker.NewChainScoreCalculator(ranker.NewRankerConfig())
}

func state() ranker.ChainState {
	return ranker.ChainState{
		Count:                   4,
		Stage:                   ranker.ChainStateCandidate,
		Event:                   ranker.EventAdd,
		EdgeCosines:             []float64{0.5, 0.5, 0.5, 0.5},
		ParticipantReliability:  []float64{0.8, 0.8, 0.8, 0.8},
		ParticipantClusterSizes: []int{3, 3, 3, 3},
		ApprovedVotes:           0,
	}
}

func TestScoreRangeAndFourDecimals(t *testing.T) {
	calc := newCalc()

	cases := []ranker.ChainState{
		state(),
		func() ranker.ChainState {
			s := state()
			s.Count = 100
			s.EdgeCosines = []float64{1, 1, 1, 1}
			s.ParticipantClusterSizes = []int{1000000, 1000000, 1000000, 1000000}
			s.ParticipantReliability = []float64{1, 1, 1, 1}
			s.ApprovedVotes = 100
			s.Stage = ranker.ChainStateCompleted
			return s
		}(),
		func() ranker.ChainState {
			s := state()
			s.EdgeCosines = []float64{-1, -1, -1, -1}
			s.ParticipantReliability = []float64{0.75, 0.75, 0.75, 0.75}
			s.ParticipantClusterSizes = []int{0, 0, 0, 0}
			s.ApprovedVotes = 0
			s.Stage = ranker.ChainStateBroken
			return s
		}(),
	}

	for i, s := range cases {
		sc, err := calc.Score(s)
		if err != nil {
			t.Fatalf("case %d: Score() error = %v", i, err)
		}
		if sc < 0 || sc > 1 {
			t.Fatalf("case %d: score %v out of [0,1]", i, sc)
		}
		if math.Abs(sc*1e4-math.Round(sc*1e4)) > 1e-9 {
			t.Fatalf("case %d: score %v not rounded to 4 decimals", i, sc)
		}
	}
}

func TestMonotonicityStatusAndApprovals(t *testing.T) {
	calc := newCalc()
	base := func(stage ranker.ChainStateStatus, votes int) ranker.ChainState {
		s := state()
		s.Stage = stage
		s.ApprovedVotes = votes
		return s
	}

	frozen := func(stage ranker.ChainStateStatus) float64 {
		sc, err := calc.Score(base(stage, 2))
		if err != nil {
			t.Fatalf("Score() error = %v", err)
		}
		return sc
	}

	cand := frozen(ranker.ChainStateCandidate)
	prop := frozen(ranker.ChainStateProposed)
	if prop <= cand {
		t.Fatalf("expected PROPOSED > CANDIDATE, got PROPOSED=%v CANDIDATE=%v", prop, cand)
	}
	if frozen(ranker.ChainStateFrozen) < prop {
		t.Fatalf("expected FROZEN >= PROPOSED")
	}

	less := frozen(ranker.ChainStateCandidate)
	moreS := base(ranker.ChainStateCandidate, 4)
	more, err := calc.Score(moreS)
	if err != nil {
		t.Fatalf("Score() error = %v", err)
	}
	if more < less {
		t.Fatalf("expected more approvals not to lower score: less=%v more=%v", less, more)
	}
}

func TestLiquiditySaturation(t *testing.T) {
	calc := newCalc()

	capS := func(size int) float64 {
		s := state()
		s.ParticipantClusterSizes = []int{size, size, size, size}
		sc, err := calc.Score(s)
		if err != nil {
			t.Fatalf("Score() error = %v", err)
		}
		return sc
	}
	if capS(4) != capS(100) {
		t.Fatalf("Liquidity should saturate: cap=%v large=%v", capS(4), capS(100))
	}
}

func TestDeterminism(t *testing.T) {
	calc := newCalc()
	s := state()
	a, _ := calc.Score(s)
	b, _ := calc.Score(s)
	if a != b {
		t.Fatalf("Score() not deterministic: %v != %v", a, b)
	}
}

func TestClampHoldsAnomalies(t *testing.T) {
	calc := newCalc()
	s := state()
	s.Count = 2
	s.EdgeCosines = []float64{1, 1}
	s.ParticipantReliability = []float64{1, 1}
	s.ParticipantClusterSizes = []int{100, 100}
	s.ApprovedVotes = 2
	s.Stage = ranker.ChainStateCompleted
	sc, err := calc.Score(s)
	if err != nil {
		t.Fatalf("Score() error = %v", err)
	}
	if sc > 1 {
		t.Fatalf("clamp failed: score %v > 1", sc)
	}
	normal, _ := calc.Score(state())
	if normal >= 1 {
		t.Fatalf("expected normal score < 1, got %v", normal)
	}
}

func TestExtractFeaturesInProgressIsFrozen(t *testing.T) {
	s := state()
	s.Stage = ranker.ChainStateInProgress
	s.ApprovedVotes = s.Count
	f, err := ranker.ExtractFeatures(s, ranker.NewRankerConfig())
	if err != nil {
		t.Fatal(err)
	}
	if f.IsFrozen != 1 {
		t.Fatalf("IN_PROGRESS IsFrozen=%d, want 1", f.IsFrozen)
	}
	if f.IsProposed != 1 {
		t.Fatalf("IN_PROGRESS IsProposed=%d, want 1", f.IsProposed)
	}
	if math.Abs(f.Progress-1) > 1e-9 {
		t.Fatalf("IN_PROGRESS Progress=%v, want 1", f.Progress)
	}
}
	calc := newCalc()

	s := state()
	s.Count = 1
	if _, err := calc.Score(s); !errors.Is(err, ranker.ErrInvalidChainState) {
		t.Fatalf("want ErrInvalidChainState, got %v", err)
	}

	s = state()
	s.ApprovedVotes = 99
	if _, err := calc.Score(s); !errors.Is(err, ranker.ErrInvalidChainState) {
		t.Fatalf("want ErrInvalidChainState, got %v", err)
	}
}

func TestEmptyEdgeCosinesMeansZeroMatch(t *testing.T) {
	calc := newCalc()
	s := state()
	s.EdgeCosines = nil
	sc, err := calc.Score(s)
	if err != nil {
		t.Fatalf("Score() error = %v", err)
	}
	if sc < 0 || sc > 1 {
		t.Fatalf("score out of range: %v", sc)
	}
}

func TestSituationalMethods(t *testing.T) {
	calc := newCalc()
	s := state()

	create, err := calc.ScoreForAdd(s)
	if err != nil {
		t.Fatalf("ScoreForAdd error = %v", err)
	}

	respond, err := calc.ScoreForRespond(s)
	if err != nil {
		t.Fatalf("ScoreForRespond error = %v", err)
	}
	if create < 0 || create > 1 || respond < 0 || respond > 1 {
		t.Fatalf("situational score out of range: create=%v respond=%v", create, respond)
	}
	decline, err := calc.ScoreForDecline(s)
	if err != nil {
		t.Fatalf("ScoreForDecline error = %v", err)
	}
	if decline != create {
		t.Fatalf("expected decline to return to add-score (no accumulation): decline=%v create=%v", decline, create)
	}

	repl := s
	repl.EdgeCosines = []float64{0.1, 0.1, 0.1, 0.1}
	repl.ParticipantReliability = []float64{0.2, 0.2, 0.2, 0.2}
	repl.ParticipantClusterSizes = []int{1, 1, 1, 1}
	replScore, err := calc.ScoreForReplacement(repl)
	if err != nil {
		t.Fatalf("ScoreForReplacement error = %v", err)
	}
	if replScore > create {
		t.Fatalf("expected replacement with weaker participant to lower score: repl=%v create=%v", replScore, create)
	}
}
