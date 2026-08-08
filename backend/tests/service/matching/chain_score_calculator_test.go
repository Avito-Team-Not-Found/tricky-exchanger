package matching_test

import (
	"errors"
	"math"
	"testing"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/matching"
)

func newCalc() *matching.ChainScoreCalculator {
	return matching.NewChainScoreCalculator(matching.NewRankerConfig())
}

func state() matching.ChainState {
	return matching.ChainState{
		Count:                   4,
		Stage:                   matching.ChainStateCandidate,
		Event:                   matching.EventAdd,
		EdgeCosines:             []float64{0.5, 0.5, 0.5, 0.5},
		ParticipantReliability:  []float64{0.8, 0.8, 0.8, 0.8},
		ParticipantClusterSizes: []int{3, 3, 3, 3},
		ApprovedVotes:           0,
	}
}

// Score возвращается в [0,1] (не в [0,100]) и с округлением до 4 знаков.
func TestScoreRangeAndFourDecimals(t *testing.T) {
	calc := newCalc()

	cases := []matching.ChainState{
		state(), // базовый
		func() matching.ChainState {
			s := state()
			s.Count = 100
			s.EdgeCosines = []float64{1, 1, 1, 1}
			s.ParticipantClusterSizes = []int{1000000, 1000000, 1000000, 1000000}
			s.ParticipantReliability = []float64{1, 1, 1, 1}
			s.ApprovedVotes = 100
			s.Stage = matching.ChainStateCompleted
			return s
		}(), // верхняя граница: все максимумы
		func() matching.ChainState {
			s := state()
			s.EdgeCosines = []float64{-1, -1, -1, -1}
			s.ParticipantReliability = []float64{0.75, 0.75, 0.75, 0.75}
			s.ParticipantClusterSizes = []int{0, 0, 0, 0}
			s.ApprovedVotes = 0
			s.Stage = matching.ChainStateBroken
			return s
		}(), // нижняя граница: все минимумы
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
	base := func(stage matching.ChainStateStatus, votes int) matching.ChainState {
		s := state()
		s.Stage = stage
		s.ApprovedVotes = votes
		return s
	}

	frozen := func(stage matching.ChainStateStatus) float64 {
		sc, err := calc.Score(base(stage, 2))
		if err != nil {
			t.Fatalf("Score() error = %v", err)
		}
		return sc
	}

	// PROPOSED > CANDIDATE при прочих равных.
	cand := frozen(matching.ChainStateCandidate)
	prop := frozen(matching.ChainStateProposed)
	if prop <= cand {
		t.Fatalf("expected PROPOSED > CANDIDATE, got PROPOSED=%v CANDIDATE=%v", prop, cand)
	}
	// FROZEN >= PROPOSED (двойной бонус: is_proposed + is_frozen).
	if frozen(matching.ChainStateFrozen) < prop {
		t.Fatalf("expected FROZEN >= PROPOSED")
	}

	// Больше approved -> не меньше score.
	less := frozen(matching.ChainStateCandidate) // votes=2
	moreS := base(matching.ChainStateCandidate, 4)
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

	// minClusterSize = CAP и = 100 дают одинаковый (насыщенный) вклад.
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
	s.Stage = matching.ChainStateCompleted
	sc, err := calc.Score(s)
	if err != nil {
		t.Fatalf("Score() error = %v", err)
	}
	if sc > 1 {
		t.Fatalf("clamp failed: score %v > 1", sc)
	}
	// на нормальных входах clamp не должен давать 1 (максимум = все единицы).
	normal, _ := calc.Score(state())
	if normal >= 1 {
		t.Fatalf("expected normal score < 1, got %v", normal)
	}
}

func TestValidationErrors(t *testing.T) {
	calc := newCalc()

	// Count < 2.
	s := state()
	s.Count = 1
	if _, err := calc.Score(s); !errors.Is(err, entity.ErrInvalidChainState) {
		t.Fatalf("want ErrInvalidChainState, got %v", err)
	}

	// ApprovedVotes вне [0, Count].
	s = state()
	s.ApprovedVotes = 99
	if _, err := calc.Score(s); !errors.Is(err, entity.ErrInvalidChainState) {
		t.Fatalf("want ErrInvalidChainState, got %v", err)
	}
}

func TestEmptyEdgeCosinesMeansZeroMatch(t *testing.T) {
	calc := newCalc()
	s := state()
	s.EdgeCosines = nil // Count>=2, но пустые рёбра
	sc, err := calc.Score(s)
	if err != nil {
		t.Fatalf("Score() error = %v", err)
	}
	// Не должно падать; Match=0. Просто проверяем, что вызывается без паники и в диапазоне.
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

	// Отклик повышает score за счёт Progress (ApprovedVotes++).
	// decline возвращает то же состояние без голоса -> score падает ровно к create.
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

	// ScoreForReplacement с новым участником (слабее надёжность/совпадение) должен изменить score.
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
