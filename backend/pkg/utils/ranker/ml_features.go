package ranker

import (
	"log/slog"
	"time"
)

// FeatureNames — канонический порядок 16 фич LightGBM (как в ml/features.json).
var FeatureNames = []string{
	"match_mean",
	"min_edge",
	"edge_spread",
	"liquidity_min",
	"liquidity_mean",
	"size_spread",
	"count",
	"progress",
	"is_proposed",
	"is_frozen",
	"hours_since_created",
	"hours_in_stage",
	"vote_velocity",
	"category_popularity",
	"category_diversity",
	"reliability_mean",
}

// ContextSnapshot — сырые прод-поля для ChainState (времена, категории, каунты).
type ContextSnapshot struct {
	CreatedAt         time.Time
	StageEnteredAt    time.Time
	VoteTimes         []time.Time
	OfferedCategories []string
	WantedCategories  []string
	CategoryCounts    map[string]int
	CategoryTotal     int
}

// ApplyContext копирует снапшот в ChainState. Нулевой CreatedAt/StageEnteredAt
// заменяется на now, чтобы часы не считались от year-zero.
func ApplyContext(s ChainState, snap ContextSnapshot, now time.Time) ChainState {
	if now.IsZero() {
		now = time.Now()
	}
	s.Now = now
	s.CreatedAt = snap.CreatedAt
	s.StageEnteredAt = snap.StageEnteredAt
	s.VoteTimes = snap.VoteTimes
	s.OfferedCategories = snap.OfferedCategories
	s.WantedCategories = snap.WantedCategories
	s.CategoryCounts = snap.CategoryCounts
	s.CategoryTotal = snap.CategoryTotal
	if s.CreatedAt.IsZero() {
		s.CreatedAt = now
	}
	if s.StageEnteredAt.IsZero() {
		s.StageEnteredAt = s.CreatedAt
	}
	return s
}

// ExtractMLFeatures строит 16 фич манифеста. ExtractFeatures (формула) не меняется:
// overlapping поля считаются тем же экстрактором.
func ExtractMLFeatures(s ChainState, cfg RankerConfig) (map[string]float64, error) {
	cfg = cfg.normalize()
	extracted, err := ExtractFeatures(s, cfg)
	if err != nil {
		return nil, err
	}

	now := s.Now
	if now.IsZero() {
		now = time.Now()
	}

	matchEdges := make([]float64, len(s.EdgeCosines))
	for i, c := range s.EdgeCosines {
		matchEdges[i] = (c + 1) / 2
	}

	cap := float64(cfg.LiquidityCap)
	liqMean := 0.0
	sizeSpread := 0.0
	if len(s.ParticipantClusterSizes) > 0 {
		minSize, maxSize := s.ParticipantClusterSizes[0], s.ParticipantClusterSizes[0]
		var sum int
		for _, sz := range s.ParticipantClusterSizes {
			sum += sz
			if sz < minSize {
				minSize = sz
			}
			if sz > maxSize {
				maxSize = sz
			}
		}
		liqMean = float64(sum) / float64(len(s.ParticipantClusterSizes)) / cap
		if liqMean > 1 {
			liqMean = 1
		}
		sizeSpread = float64(maxSize - minSize)
	}

	minEdge, edgeSpread := 0.0, 0.0
	if len(matchEdges) > 0 {
		minE, maxE := matchEdges[0], matchEdges[0]
		for _, e := range matchEdges[1:] {
			if e < minE {
				minE = e
			}
			if e > maxE {
				maxE = e
			}
		}
		minEdge = minE
		edgeSpread = maxE - minE
	}

	hoursCreated := now.Sub(s.CreatedAt).Hours()
	if hoursCreated < 0 || s.CreatedAt.IsZero() {
		hoursCreated = 0
	}
	stageStart := s.StageEnteredAt
	if stageStart.IsZero() {
		stageStart = s.CreatedAt
	}
	hoursStage := now.Sub(stageStart).Hours()
	if hoursStage < 0 || stageStart.IsZero() {
		hoursStage = 0
	}

	nVotes := len(s.VoteTimes)
	if nVotes == 0 {
		nVotes = s.ApprovedVotes
	}
	velocity := 0.0
	if hoursStage > 0 {
		velocity = float64(nVotes) / hoursStage
	}

	offered := s.OfferedCategories
	nCat := len(offered)
	if nCat == 0 {
		nCat = s.Count
	}
	popularity := 0.0
	if s.CategoryTotal > 0 && nCat > 0 && len(offered) > 0 {
		var sum float64
		for _, cat := range offered {
			sum += float64(s.CategoryCounts[cat]) / float64(s.CategoryTotal)
		}
		popularity = sum / float64(len(offered))
	}

	unique := 0
	seen := make(map[string]struct{}, len(offered))
	for _, cat := range offered {
		if cat == "" {
			continue
		}
		if _, ok := seen[cat]; ok {
			continue
		}
		seen[cat] = struct{}{}
		unique++
	}
	diversity := 0.0
	if s.Count > 0 {
		diversity = float64(unique) / float64(s.Count)
	}

	return map[string]float64{
		"match_mean":          extracted.Match,
		"min_edge":            minEdge,
		"edge_spread":         edgeSpread,
		"liquidity_min":       extracted.Liquidity,
		"liquidity_mean":      liqMean,
		"size_spread":         sizeSpread,
		"count":               float64(s.Count),
		"progress":            extracted.Progress,
		"is_proposed":         float64(extracted.IsProposed),
		"is_frozen":           float64(extracted.IsFrozen),
		"hours_since_created": hoursCreated,
		"hours_in_stage":      hoursStage,
		"vote_velocity":       velocity,
		"category_popularity": popularity,
		"category_diversity":  diversity,
		"reliability_mean":    extracted.Reliability,
	}, nil
}

// SparseChainStateReasons — нулевые времена/категории после заполнения из прода.
func SparseChainStateReasons(s ChainState) []string {
	var reasons []string
	if s.CreatedAt.IsZero() {
		reasons = append(reasons, "created_at")
	}
	if s.StageEnteredAt.IsZero() {
		reasons = append(reasons, "stage_entered_at")
	}
	if allEmpty(s.OfferedCategories) {
		reasons = append(reasons, "offered_categories")
	}
	if allEmpty(s.WantedCategories) {
		reasons = append(reasons, "wanted_categories")
	}
	return reasons
}

// LogSparseChainState пишет debug, если после join времена/категории пустые.
func LogSparseChainState(s ChainState) {
	reasons := SparseChainStateReasons(s)
	if len(reasons) == 0 {
		return
	}
	slog.Debug("ranker chain state sparse", "reasons", reasons, "event", s.Event)
}

func allEmpty(values []string) bool {
	if len(values) == 0 {
		return true
	}
	for _, v := range values {
		if v != "" {
			return false
		}
	}
	return true
}
