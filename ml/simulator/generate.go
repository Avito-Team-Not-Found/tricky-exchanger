package main

import (
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"sort"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/pkg/utils/ranker"
)

const (
	windowHours      = 48.0
	relObs           = 0.75
	pFraud           = 0.03
	lambdaResponse   = 2.0 // Exp(λ·m_i): λ не задан в ТЗ; большой λ → окно 48ч почти не режет воронку
	lambdaConfirm    = 2.0
	lambdaInProgress = 0.25 // Exp(λ) delay FROZEN→IN_PROGRESS; mean 4ч, клип 24ч
	shipWindowHours  = 24.0
	pEmitRespond     = 0.5
	pReplHigh        = 0.6
	pReplLow         = 0.1
	epsSigma         = 0.3
	cosNoiseSigma    = 0.12
	sizeNoiseOffset  = 1.5 // «шум» в Poisson(pop·3+шум): поднимает P(min_size≥2) и долю замен
)

// Фиксированный каталог: обход только по индексу, без map.
var categoryCatalog = []string{
	"phones", "consoles", "laptops", "cameras", "bikes",
	"guitars", "tablets", "headphones", "watches", "games",
	"books", "furniture",
}

type oracle struct {
	Count       int       `json:"count"`
	Pop         float64   `json:"pop"`
	Offered     []string  `json:"offered"`
	Wanted      []string  `json:"wanted"`
	Sizes       []int     `json:"sizes"`
	R           []float64 `json:"r"`
	M           []float64 `json:"m"`
	CE          []float64 `json:"c_e"`
	CosE        []float64 `json:"cos_e"`
	Fraud       bool      `json:"fraud"`
	Epsilon     float64   `json:"epsilon"`
	Reason      string    `json:"reason"`
	TProp       float64   `json:"t_prop"`
	TFrozen     float64   `json:"t_frozen"`
	TInProgress float64   `json:"t_inprogress"`
	Replaced    bool      `json:"replaced"`
}

type chainSim struct {
	id          int
	count       int
	pop         float64
	offered     []string
	wanted      []string
	sizes       []int
	r           []float64
	m           []float64
	cE          []float64
	cosE        []float64
	fraud       bool
	epsilon     float64
	label       string
	reason      string
	tProp       float64
	tFrozen     float64
	tInProgress float64
	tConfWin    float64
	replaced    bool
	arrived     []float64 // времена пришедших откликов, отсортированы
}

type csvRow struct {
	chainID int
	rowSeq  int
	event   string
	stage   string
	label   string
	score   float64
	rawJSON string
	feats   []string
}

type generator struct {
	rng    *rand.Rand
	ranker *ranker.ChainScoreCalculator
	cfg    ranker.RankerConfig
}

func newGenerator(seed int64) *generator {
	cfg := ranker.NewRankerConfig()
	return &generator{
		rng:    rand.New(rand.NewSource(seed)),
		ranker: ranker.NewChainScoreCalculator(cfg),
		cfg:    cfg,
	}
}

// Generate строит n синтетических цепочек с одним RNG-seed.
// Повторный вызов с тем же seed возвращает идентичный датасет.
func Generate(seed int64, n int) []csvRow {
	g := newGenerator(seed)
	rows := make([]csvRow, 0, n*4)
	for i := 1; i <= n; i++ {
		ch := g.simulateChain(i)
		rows = append(rows, g.emitRows(ch)...)
	}
	return rows
}

func sampleCount(rng *rand.Rand) int {
	u := rng.Float64()
	switch {
	case u < 0.50:
		return 2
	case u < 0.85:
		return 3
	default:
		return 4
	}
}

func (g *generator) simulateChain(id int) chainSim {
	rng := g.rng
	n := sampleCount(rng)
	pop := rng.Float64()
	eps := normSigma(rng, epsSigma)

	offered := make([]string, n)
	wanted := make([]string, n)
	for i := 0; i < n; i++ {
		offered[i] = categoryCatalog[rng.Intn(len(categoryCatalog))]
	}
	for i := 0; i < n; i++ {
		wanted[i] = offered[(i+1)%n]
	}

	sizes := make([]int, n)
	rate := pop*3 + eps + sizeNoiseOffset
	if rate < 0 {
		rate = 0
	}
	for i := 0; i < n; i++ {
		sizes[i] = clipInt(1+poissonKnuth(rng, rate), 1, 12)
	}

	r := make([]float64, n)
	m := make([]float64, n)
	cE := make([]float64, n)
	cosE := make([]float64, n)
	for i := 0; i < n; i++ {
		r[i] = beta22(rng)
		m[i] = rng.Float64()
		cE[i] = beta22(rng)
		cosE[i] = clip(2*cE[i]-1+normSigma(rng, cosNoiseSigma), -1, 1)
	}
	fraud := bernoulli(rng, pFraud)
	meanC := meanFloat(cE)

	ch := chainSim{
		id:      id,
		count:   n,
		pop:     pop,
		offered: offered,
		wanted:  wanted,
		sizes:   sizes,
		r:       r,
		m:       m,
		cE:      cE,
		cosE:    cosE,
		fraud:   fraud,
		epsilon: eps,
		label:   "BROKEN",
	}

	// --- отклики ---
	arrived := make([]float64, 0, n)
	for i := 0; i < n; i++ {
		pResp := clip(0.35+0.45*meanC+0.25*m[i]-0.05*float64(n-2), 0.05, 0.98)
		if !bernoulli(rng, pResp) {
			continue
		}
		t := expSample(rng, lambdaResponse*m[i])
		if t <= windowHours {
			arrived = append(arrived, t)
		}
	}
	sort.Float64s(arrived)
	ch.arrived = arrived

	if len(arrived) < n {
		ch.reason = "proposed_timeout"
		return ch
	}
	ch.tProp = arrived[n-1]

	// --- подтверждения ---
	confirmTimes := make([]float64, 0, n)
	allConfirmed := true
	for i := 0; i < n; i++ {
		pConf := clip(0.30+0.50*r[i]+0.20*meanC-0.08*float64(n-2), 0.05, 0.98)
		if !bernoulli(rng, pConf) {
			allConfirmed = false
			continue
		}
		t := expSample(rng, lambdaConfirm*r[i])
		if t <= windowHours {
			confirmTimes = append(confirmTimes, t)
		} else {
			allConfirmed = false
		}
	}

	if allConfirmed && len(confirmTimes) == n {
		ch.tConfWin = maxFloat(confirmTimes)
	} else {
		pRepl := pReplLow
		if minInt(sizes) >= 2 {
			pRepl = pReplHigh
		}
		if !bernoulli(rng, pRepl) {
			ch.reason = "replacement_fail"
			return ch
		}
		// успех замены: перерисовываем r первого (детерминированно — индекс 0)
		// участника; в проде заменяют отказавшего, для oracle достаточно нового r.
		ch.r[0] = beta22(rng)
		ch.replaced = true
		ch.tConfWin = windowHours
	}
	if ch.tConfWin <= 0 {
		ch.tConfWin = 1e-6
	}
	ch.tFrozen = ch.tProp + ch.tConfWin

	// --- отправка на ПВЗ (FROZEN → IN_PROGRESS) ---
	minR := minFloat(ch.r)
	pNoship := clip(0.03+0.20*(1-minR), 0.02, 0.5)
	if bernoulli(rng, pNoship) {
		ch.reason = "no_show"
		return ch
	}
	delay := expSample(rng, lambdaInProgress)
	if delay > shipWindowHours {
		delay = shipWindowHours
	}
	ch.tInProgress = ch.tFrozen + delay

	// --- совпадение товара на ПВЗ (IN_PROGRESS → COMPLETED) ---
	pMismatch := 0.02
	if ch.fraud {
		pMismatch += 0.6
	}
	if bernoulli(rng, pMismatch) {
		ch.reason = "item_mismatch"
		return ch
	}
	ch.label = "COMPLETED"
	ch.reason = "completed"
	return ch
}

func (g *generator) emitRows(ch chainSim) []csvRow {
	raw := mustJSON(oracle{
		Count:       ch.count,
		Pop:         ch.pop,
		Offered:     append([]string(nil), ch.offered...),
		Wanted:      append([]string(nil), ch.wanted...),
		Sizes:       append([]int(nil), ch.sizes...),
		R:           append([]float64(nil), ch.r...),
		M:           append([]float64(nil), ch.m...),
		CE:          append([]float64(nil), ch.cE...),
		CosE:        append([]float64(nil), ch.cosE...),
		Fraud:       ch.fraud,
		Epsilon:     ch.epsilon,
		Reason:      ch.reason,
		TProp:       ch.tProp,
		TFrozen:     ch.tFrozen,
		TInProgress: ch.tInProgress,
		Replaced:    ch.replaced,
	})

	rows := make([]csvRow, 0, 4)
	seq := 0
	push := func(event, stage string, votes int, hoursCreated, hoursStage, velocity float64) {
		row, err := g.buildRow(ch, seq, event, stage, votes, hoursCreated, hoursStage, velocity, raw)
		if err != nil {
			panic(err)
		}
		rows = append(rows, row)
		seq++
	}

	push("ADD", "CANDIDATE", 0, 0, 0, 0)

	if bernoulli(g.rng, pEmitRespond) && len(ch.arrived) > 0 {
		maxK := len(ch.arrived)
		if maxK >= ch.count {
			maxK = ch.count - 1
		}
		if maxK >= 1 {
			k := 1 + g.rng.Intn(maxK)
			tMid := ch.arrived[k-1]
			if tMid <= 0 {
				tMid = 1e-6
			}
			// Голосов в час на текущей стадии (CANDIDATE): k откликов за tMid часов.
			push("RESPOND", "CANDIDATE", k, tMid, tMid, float64(k)/tMid)
		}
	}

	if ch.reason == "proposed_timeout" {
		return rows
	}
	push("PROPOSED", "PROPOSED", 0, ch.tProp, 0, 0)

	if ch.reason == "replacement_fail" {
		return rows
	}
	vel := float64(ch.count) / ch.tConfWin
	push("FROZEN", "FROZEN", ch.count, ch.tFrozen, 0, vel)
	if ch.reason == "no_show" {
		return rows
	}
	hoursIn := ch.tInProgress - ch.tFrozen
	if hoursIn < 0 {
		hoursIn = 0
	}
	push("IN_PROGRESS", "IN_PROGRESS", ch.count, ch.tInProgress, hoursIn, 0)
	return rows
}

func (g *generator) buildRow(
	ch chainSim,
	seq int,
	event, stage string,
	votes int,
	hoursCreated, hoursStage, velocity float64,
	raw string,
) (csvRow, error) {
	st := ranker.ChainState{
		Count:                   ch.count,
		Stage:                   ranker.ChainStateStatus(stage),
		Event:                   eventToRanker(event),
		EdgeCosines:             append([]float64(nil), ch.cosE...),
		ParticipantReliability:  repeatFloat(relObs, ch.count),
		ParticipantClusterSizes: append([]int(nil), ch.sizes...),
		ApprovedVotes:           votes,
	}
	score, err := g.ranker.Score(st)
	if err != nil {
		return csvRow{}, fmt.Errorf("chain %d %s: score: %w", ch.id, event, err)
	}
	extracted, err := ranker.ExtractFeatures(st, g.cfg)
	if err != nil {
		return csvRow{}, fmt.Errorf("chain %d %s: features: %w", ch.id, event, err)
	}

	matchEdges := make([]float64, len(ch.cosE))
	for i, c := range ch.cosE {
		matchEdges[i] = (c + 1) / 2
	}
	cap := float64(g.cfg.LiquidityCap)
	liqMean := meanInt(ch.sizes) / cap
	if liqMean > 1 {
		liqMean = 1
	}
	diversity := float64(uniqueCount(ch.offered)) / float64(ch.count)

	values := map[string]float64{
		"match_mean":          extracted.Match,
		"min_edge":            minFloat(matchEdges),
		"edge_spread":         maxFloat(matchEdges) - minFloat(matchEdges),
		"liquidity_min":       extracted.Liquidity,
		"liquidity_mean":      liqMean,
		"size_spread":         float64(maxInt(ch.sizes) - minInt(ch.sizes)),
		"count":               float64(ch.count),
		"progress":            extracted.Progress,
		"is_proposed":         float64(extracted.IsProposed),
		"is_frozen":           float64(extracted.IsFrozen),
		"hours_since_created": hoursCreated,
		"hours_in_stage":      hoursStage,
		"vote_velocity":       velocity,
		"category_popularity": ch.pop,
		"category_diversity":  diversity,
		"reliability_mean":    extracted.Reliability,
	}

	feats := make([]string, len(featureNames))
	for i, name := range featureNames {
		feats[i] = formatFeature(name, values[name])
	}

	return csvRow{
		chainID: ch.id,
		rowSeq:  seq,
		event:   event,
		stage:   stage,
		label:   ch.label,
		score:   score,
		rawJSON: raw,
		feats:   feats,
	}, nil
}

func eventToRanker(event string) ranker.StateEvent {
	switch event {
	case "ADD":
		return ranker.EventAdd
	case "RESPOND", "PROPOSED":
		return ranker.EventRespond
	case "FROZEN", "IN_PROGRESS":
		return ranker.EventConfirm
	default:
		return ranker.EventAdd
	}
}

func formatFeature(name string, v float64) string {
	switch name {
	case "count", "is_proposed", "is_frozen":
		return fmt.Sprintf("%d", int(math.Round(v)))
	default:
		return strconvFormat(v)
	}
}

func strconvFormat(v float64) string {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return "0.000000"
	}
	return fmt.Sprintf("%.6f", v)
}

func mustJSON(v oracle) string {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return string(b)
}
