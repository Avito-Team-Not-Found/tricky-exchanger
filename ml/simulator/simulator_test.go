package main

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"testing"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/pkg/utils/ranker"
)

var latentJSONKeys = []string{"r", "m", "c_e", "fraud", "epsilon"}

// TestDeterminism: один seed = один датасет. Generate не должен зависеть
// от глобального рандома или порядка обхода map.
func TestDeterminism(t *testing.T) {
	a := Generate(42, 100)
	b := Generate(42, 100)
	if len(a) == 0 || len(a) != len(b) {
		t.Fatalf("len: %d vs %d", len(a), len(b))
	}
	for i := range a {
		if !reflect.DeepEqual(a[i], b[i]) {
			t.Fatalf("row %d differs: chain=%d seq=%d vs chain=%d seq=%d",
				i, a[i].chainID, a[i].rowSeq, b[i].chainID, b[i].rowSeq)
		}
	}
	csvA, err := renderCSV(a)
	if err != nil {
		t.Fatal(err)
	}
	csvB, err := renderCSV(b)
	if err != nil {
		t.Fatal(err)
	}
	if !bytesEqual(csvA, csvB) {
		t.Fatal("CSV bytes differ for the same seed")
	}
}

// TestObservationRanges: наблюдаемые поля всегда в допустимых интервалах,
// независимо от seed и формул воронки.
func TestObservationRanges(t *testing.T) {
	rows := Generate(42, 80)
	seen := map[int]struct{}{}
	for _, row := range rows {
		o, err := parseOracleRow(row)
		if err != nil {
			t.Fatal(err)
		}
		if _, dup := seen[row.chainID]; dup {
			continue
		}
		seen[row.chainID] = struct{}{}
		if o.Count != 2 && o.Count != 3 && o.Count != 4 {
			t.Fatalf("chain %d: Count=%d, want {2,3,4}", row.chainID, o.Count)
		}
		if len(o.CosE) != o.Count || len(o.Sizes) != o.Count {
			t.Fatalf("chain %d: slice length mismatch", row.chainID)
		}
		for i, c := range o.CosE {
			if c < -1 || c > 1 || math.IsNaN(c) {
				t.Fatalf("chain %d: cos_e[%d]=%v not in [-1,1]", row.chainID, i, c)
			}
		}
		for i, sz := range o.Sizes {
			if sz < 1 || sz > 12 {
				t.Fatalf("chain %d: size[%d]=%d not in [1,12]", row.chainID, i, sz)
			}
		}
		assertCategoryCycle(t, row.chainID, o)
	}
	relIdx := featIndex("reliability_mean")
	for i, row := range rows {
		x, err := parseFloat(row.feats[relIdx])
		if err != nil {
			t.Fatal(err)
		}
		if math.Abs(x-relObs) > 1e-9 {
			t.Fatalf("row %d: reliability_mean=%v, want %v", i, x, relObs)
		}
	}
}

// TestFunnelEdgeCases: направление влияния латенток, без точных вероятностей.
// Низкий r повышает риск freeze_fail; высокий pop → крупные кластеры → чаще замена.
func TestFunnelEdgeCases(t *testing.T) {
	rows := Generate(7, 500)
	chains := firstRowsByChain(rows)

	var lowRComp, lowRFrozen, highRComp, highRFrozen int
	var lowPopSize, highPopSize float64
	var lowPopN, highPopN int
	var lowPopReplOK, lowPopReplTry, highPopReplOK, highPopReplTry int

	for _, row := range chains {
		o, err := parseOracleRow(row)
		if err != nil {
			t.Fatal(err)
		}
		meanR := meanFloat(o.R)
		meanSize := meanInt(o.Sizes)

		if o.Pop <= 0.3 {
			lowPopSize += meanSize
			lowPopN++
		}
		if o.Pop >= 0.7 {
			highPopSize += meanSize
			highPopN++
		}

		reachedFrozen := o.Reason == "completed" || o.Reason == "freeze_fail"
		if reachedFrozen {
			if meanR <= 0.4 {
				lowRFrozen++
				if o.Reason == "completed" {
					lowRComp++
				}
			}
			if meanR >= 0.6 {
				highRFrozen++
				if o.Reason == "completed" {
					highRComp++
				}
			}
		}

		attemptedRepl := o.Replaced || o.Reason == "confirm_timeout"
		if attemptedRepl {
			if o.Pop <= 0.3 {
				lowPopReplTry++
				if o.Replaced {
					lowPopReplOK++
				}
			}
			if o.Pop >= 0.7 {
				highPopReplTry++
				if o.Replaced {
					highPopReplOK++
				}
			}
		}
	}

	if lowPopN == 0 || highPopN == 0 {
		t.Fatalf("need both pop tails: low=%d high=%d", lowPopN, highPopN)
	}
	if lowPopSize/float64(lowPopN) >= highPopSize/float64(highPopN) {
		t.Fatalf("expected larger clusters at high pop: low=%.3f high=%.3f",
			lowPopSize/float64(lowPopN), highPopSize/float64(highPopN))
	}

	if lowRFrozen < 8 || highRFrozen < 8 {
		t.Fatalf("not enough frozen tails: lowR=%d highR=%d", lowRFrozen, highRFrozen)
	}
	pLow := float64(lowRComp) / float64(lowRFrozen)
	pHigh := float64(highRComp) / float64(highRFrozen)
	if pHigh <= pLow {
		t.Fatalf("high r should complete more often after FROZEN: P(low r)=%.3f P(high r)=%.3f", pLow, pHigh)
	}

	if lowPopReplTry < 5 || highPopReplTry < 5 {
		t.Fatalf("not enough replacement attempts: lowPop=%d highPop=%d", lowPopReplTry, highPopReplTry)
	}
	pReplLowPop := float64(lowPopReplOK) / float64(lowPopReplTry)
	pReplHighPop := float64(highPopReplOK) / float64(highPopReplTry)
	if pReplHighPop <= pReplLowPop {
		t.Fatalf("high pop should replace more often: P(low pop)=%.3f P(high pop)=%.3f", pReplLowPop, pReplHighPop)
	}
}

// TestRowEmissionConsistency: строки одной цепи — согласованный слепок воронки.
func TestRowEmissionConsistency(t *testing.T) {
	rows := Generate(42, 80)
	byChain := groupRows(rows)
	proposedOK := map[string]bool{
		"PROPOSED": true, "FROZEN": true, "COMPLETED": true, "BROKEN": true,
	}
	frozenOK := map[string]bool{
		"FROZEN": true, "COMPLETED": true, "BROKEN": true,
	}
	pIdx := featIndex("progress")
	hIdx := featIndex("hours_since_created")
	vIdx := featIndex("vote_velocity")
	ipIdx := featIndex("is_proposed")
	ifIdx := featIndex("is_frozen")

	ids := make([]int, 0, len(byChain))
	for id := range byChain {
		ids = append(ids, id)
	}
	sort.Ints(ids)
	for _, chainID := range ids {
		chainRows := byChain[chainID]
		label := chainRows[0].label
		prevHours := -1.0
		for i, row := range chainRows {
			if row.label != label {
				t.Fatalf("chain %d: label %s vs %s", chainID, row.label, label)
			}
			progress, err := parseFloat(row.feats[pIdx])
			if err != nil {
				t.Fatal(err)
			}
			if progress < 0 || progress > 1 {
				t.Fatalf("chain %d row %d: progress=%v", chainID, i, progress)
			}
			hours, err := parseFloat(row.feats[hIdx])
			if err != nil {
				t.Fatal(err)
			}
			if hours+1e-9 < prevHours {
				t.Fatalf("chain %d: hours_since_created not monotone: %v then %v", chainID, prevHours, hours)
			}
			prevHours = hours

			isProposed, err := parseFloat(row.feats[ipIdx])
			if err != nil {
				t.Fatal(err)
			}
			isFrozen, err := parseFloat(row.feats[ifIdx])
			if err != nil {
				t.Fatal(err)
			}
			if isProposed == 1 && !proposedOK[row.stage] {
				t.Fatalf("chain %d: is_proposed=1 at stage %s", chainID, row.stage)
			}
			if isFrozen == 1 && !frozenOK[row.stage] {
				t.Fatalf("chain %d: is_frozen=1 at stage %s", chainID, row.stage)
			}
			if row.stage == "CANDIDATE" && (isProposed != 0 || isFrozen != 0) {
				t.Fatalf("chain %d: CANDIDATE must have flags 0, got proposed=%v frozen=%v", chainID, isProposed, isFrozen)
			}
			velocity, err := parseFloat(row.feats[vIdx])
			if err != nil {
				t.Fatal(err)
			}
			if row.event == "ADD" && velocity != 0 {
				t.Fatalf("chain %d: ADD vote_velocity=%v, want 0", chainID, velocity)
			}
			if row.event == "RESPOND" && hours > 0 && progress > 0 && velocity <= 0 {
				t.Fatalf("chain %d RESPOND: vote_velocity=%v, want votes/hours > 0 (progress=%v hours=%v)",
					chainID, velocity, progress, hours)
			}
		}
	}
}

// TestFeaturesManifestAlignment: колонки фич и ExtractFeatures совпадают
// с ml/features.json. Расхождение кода и манифеста — падение теста.
func TestFeaturesManifestAlignment(t *testing.T) {
	manifest, err := loadFeatureManifest()
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(manifest, featureNames) {
		t.Fatalf("featureNames != features.json\n names=%v\n json=%v", featureNames, manifest)
	}

	rows := Generate(42, 5)
	if len(rows) == 0 {
		t.Fatal("no rows")
	}
	row := rows[0]
	if len(row.feats) != len(manifest) {
		t.Fatalf("row has %d feature values, manifest has %d", len(row.feats), len(manifest))
	}

	o, err := parseOracleRow(row)
	if err != nil {
		t.Fatal(err)
	}
	st := ranker.ChainState{
		Count:                   o.Count,
		Stage:                   ranker.ChainStateStatus(row.stage),
		Event:                   eventToRanker(row.event),
		EdgeCosines:             o.CosE,
		ParticipantReliability:  repeatFloat(relObs, o.Count),
		ParticipantClusterSizes: o.Sizes,
		ApprovedVotes:           0,
	}
	extracted, err := ranker.ExtractFeatures(st, ranker.NewRankerConfig())
	if err != nil {
		t.Fatal(err)
	}
	overlap := []string{"match_mean", "liquidity_min", "progress", "is_proposed", "is_frozen", "reliability_mean"}
	got := map[string]float64{
		"match_mean":       extracted.Match,
		"liquidity_min":    extracted.Liquidity,
		"progress":         extracted.Progress,
		"is_proposed":      float64(extracted.IsProposed),
		"is_frozen":        float64(extracted.IsFrozen),
		"reliability_mean": extracted.Reliability,
	}
	for _, name := range overlap {
		idx := featIndex(name)
		if idx < 0 {
			t.Fatalf("ExtractFeatures field %s missing from features.json", name)
		}
		have, err := parseFloat(row.feats[idx])
		if err != nil {
			t.Fatal(err)
		}
		want := got[name]
		if math.Abs(have-want) > 1e-5 {
			t.Fatalf("%s: csv=%v extract=%v", name, have, want)
		}
	}
}

// TestLatentsNotInFeatures: r, m, c_e, fraud, ε живут только в raw_json.
func TestLatentsNotInFeatures(t *testing.T) {
	blocked := map[string]bool{
		"r": true, "r_i": true, "m": true, "m_i": true,
		"c_e": true, "c": true, "fraud": true, "epsilon": true, "eps": true,
	}
	for _, name := range featureNames {
		if blocked[name] {
			t.Fatalf("latent %q leaked into featureNames", name)
		}
	}

	rows := Generate(42, 20)
	for _, row := range rows {
		var raw map[string]json.RawMessage
		if err := json.Unmarshal([]byte(row.rawJSON), &raw); err != nil {
			t.Fatal(err)
		}
		for _, key := range latentJSONKeys {
			if _, ok := raw[key]; !ok {
				t.Fatalf("raw_json missing latent %q", key)
			}
		}
		for name := range blocked {
			if featIndex(name) >= 0 {
				t.Fatalf("latent %q is a feature column", name)
			}
		}
	}
}

// TestCategoryCycleIntegrity: хард-ограничение матчера — wanted[i] == offered[(i+1)%n].
func TestCategoryCycleIntegrity(t *testing.T) {
	rows := Generate(13, 120)
	seen := map[int]struct{}{}
	for _, row := range rows {
		if _, ok := seen[row.chainID]; ok {
			continue
		}
		seen[row.chainID] = struct{}{}
		o, err := parseOracleRow(row)
		if err != nil {
			t.Fatal(err)
		}
		assertCategoryCycle(t, row.chainID, o)
	}
	if len(seen) != 120 {
		t.Fatalf("expected 120 chains, got %d", len(seen))
	}
}

func parseOracleRow(row csvRow) (oracle, error) {
	var o oracle
	err := json.Unmarshal([]byte(row.rawJSON), &o)
	return o, err
}

func assertCategoryCycle(t *testing.T, chainID int, o oracle) {
	t.Helper()
	if len(o.Offered) != o.Count || len(o.Wanted) != o.Count || o.Count < 2 {
		t.Fatalf("chain %d: category length Count=%d offered=%d wanted=%d",
			chainID, o.Count, len(o.Offered), len(o.Wanted))
	}
	for i := 0; i < o.Count; i++ {
		want := o.Offered[(i+1)%o.Count]
		if o.Wanted[i] != want {
			t.Fatalf("chain %d: wanted[%d]=%q, want offered[(i+1)%%n]=%q",
				chainID, i, o.Wanted[i], want)
		}
	}
}

func firstRowsByChain(rows []csvRow) []csvRow {
	seen := map[int]struct{}{}
	out := make([]csvRow, 0)
	for _, row := range rows {
		if _, ok := seen[row.chainID]; ok {
			continue
		}
		seen[row.chainID] = struct{}{}
		out = append(out, row)
	}
	return out
}

func groupRows(rows []csvRow) map[int][]csvRow {
	byID := make(map[int][]csvRow)
	for _, row := range rows {
		byID[row.chainID] = append(byID[row.chainID], row)
	}
	return byID
}

func loadFeatureManifest() ([]string, error) {
	path := filepath.Join("..", "features.json")
	body, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var names []string
	if err := json.Unmarshal(body, &names); err != nil {
		return nil, err
	}
	return names, nil
}
