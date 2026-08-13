package main

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
)

type checkResult struct {
	Name   string
	OK     bool
	Detail string
}

func runChecks(rows []csvRow, nChains int, csvA, csvB []byte) []checkResult {
	checks := []checkResult{
		checkSchemaAndRanges(rows),
		checkReliability(rows),
		checkCategories(rows),
		checkBaseRate(rows),
		checkMonotonicity(rows),
		checkFrozenBroken(rows),
		checkInProgress(rows),
		checkVolume(rows, nChains),
		checkDeterminism(csvA, csvB),
	}
	return checks
}

func allPassed(checks []checkResult) bool {
	for _, c := range checks {
		if !c.OK {
			return false
		}
	}
	return true
}

func checkSchemaAndRanges(rows []csvRow) checkResult {
	if len(rows) == 0 {
		return checkResult{"ranges", false, "no rows"}
	}
	allowedEvent := map[string]bool{"ADD": true, "RESPOND": true, "PROPOSED": true, "FROZEN": true, "IN_PROGRESS": true}
	allowedStage := map[string]bool{"CANDIDATE": true, "PROPOSED": true, "FROZEN": true, "IN_PROGRESS": true}
	allowedLabel := map[string]bool{"COMPLETED": true, "BROKEN": true}
	for i, row := range rows {
		if !allowedEvent[row.event] || !allowedStage[row.stage] || !allowedLabel[row.label] {
			return checkResult{"ranges", false, fmt.Sprintf("row %d: event=%s stage=%s label=%s", i, row.event, row.stage, row.label)}
		}
		if len(row.feats) != len(featureNames) {
			return checkResult{"ranges", false, fmt.Sprintf("row %d: %d features, want %d", i, len(row.feats), len(featureNames))}
		}
		if row.score < 0 || row.score > 1 || math.IsNaN(row.score) {
			return checkResult{"ranges", false, fmt.Sprintf("row %d: formula_score=%v", i, row.score)}
		}
		vals, err := parseFeatMap(row)
		if err != nil {
			return checkResult{"ranges", false, fmt.Sprintf("row %d: %v", i, err)}
		}
		if err := validateFeatRanges(vals); err != nil {
			return checkResult{"ranges", false, fmt.Sprintf("row %d: %v", i, err)}
		}
	}
	return checkResult{"ranges", true, fmt.Sprintf("%d rows, types/ranges ok", len(rows))}
}

func validateFeatRanges(v map[string]float64) error {
	unit := []string{
		"match_mean", "min_edge", "edge_spread", "liquidity_min", "liquidity_mean",
		"progress", "category_popularity", "category_diversity", "reliability_mean",
	}
	for _, name := range unit {
		x := v[name]
		if x < -1e-9 || x > 1+1e-9 || math.IsNaN(x) {
			return fmt.Errorf("%s=%v not in [0,1]", name, x)
		}
	}
	if c := v["count"]; c < 2 || c > 4 {
		return fmt.Errorf("count=%v", c)
	}
	if v["is_proposed"] != 0 && v["is_proposed"] != 1 {
		return fmt.Errorf("is_proposed=%v", v["is_proposed"])
	}
	if v["is_frozen"] != 0 && v["is_frozen"] != 1 {
		return fmt.Errorf("is_frozen=%v", v["is_frozen"])
	}
	for _, name := range []string{"hours_since_created", "hours_in_stage", "vote_velocity", "size_spread"} {
		if v[name] < -1e-9 || math.IsNaN(v[name]) || math.IsInf(v[name], 0) {
			return fmt.Errorf("%s=%v", name, v[name])
		}
	}
	return nil
}

func checkReliability(rows []csvRow) checkResult {
	idx := featIndex("reliability_mean")
	for i, row := range rows {
		x, err := parseFloat(row.feats[idx])
		if err != nil {
			return checkResult{"reliability_mean", false, err.Error()}
		}
		if math.Abs(x-relObs) > 1e-9 {
			return checkResult{"reliability_mean", false, fmt.Sprintf("row %d: %v ≠ %v", i, x, relObs)}
		}
	}
	return checkResult{"reliability_mean", true, fmt.Sprintf("≡ %.2f on all rows", relObs)}
}

func checkCategories(rows []csvRow) checkResult {
	seen := map[int]struct{}{}
	for _, row := range rows {
		if _, ok := seen[row.chainID]; ok {
			continue
		}
		seen[row.chainID] = struct{}{}
		var o oracle
		if err := json.Unmarshal([]byte(row.rawJSON), &o); err != nil {
			return checkResult{"categories", false, err.Error()}
		}
		if len(o.Offered) != o.Count || len(o.Wanted) != o.Count {
			return checkResult{"categories", false, fmt.Sprintf("chain %d: len mismatch", row.chainID)}
		}
		for i := 0; i < o.Count; i++ {
			want := o.Offered[(i+1)%o.Count]
			if o.Wanted[i] != want {
				return checkResult{"categories", false, fmt.Sprintf("chain %d: wanted[%d]=%s want %s", row.chainID, i, o.Wanted[i], want)}
			}
		}
	}
	return checkResult{"categories", true, "wanted[i] == offered[(i+1)%n] for all chains"}
}

func checkBaseRate(rows []csvRow) checkResult {
	rate := completedRate(rows, "")
	ok := rate >= 0.30 && rate <= 0.45
	return checkResult{"base_rate", ok, fmt.Sprintf("P(label=COMPLETED)=%.4f (want [0.30, 0.45])", rate)}
}

func checkMonotonicity(rows []csvRow) checkResult {
	pI := completedRate(rows, "IN_PROGRESS")
	pF := completedRate(rows, "FROZEN")
	pP := completedRate(rows, "PROPOSED")
	pC := completedRate(rows, "CANDIDATE")
	ok := pI > pF && pF > pP && pP > pC &&
		pF >= 0.80 && pF <= 0.90 &&
		pP >= 0.40 && pP <= 0.60 &&
		pC >= 0.15 && pC <= 0.30
	return checkResult{
		"monotonicity",
		ok,
		fmt.Sprintf("P(comp|IN_PROGRESS)=%.4f; P(comp|FROZEN)=%.4f [0.80,0.90]; P(comp|PROPOSED)=%.4f [0.40,0.60]; P(comp|CANDIDATE)=%.4f [0.15,0.30]", pI, pF, pP, pC),
	}
}

func checkFrozenBroken(rows []csvRow) checkResult {
	var frozen, broken int
	for _, row := range rows {
		if row.stage != "FROZEN" {
			continue
		}
		frozen++
		if row.label == "BROKEN" {
			broken++
		}
	}
	if frozen == 0 {
		return checkResult{"frozen_broken", false, "no FROZEN rows"}
	}
	rate := float64(broken) / float64(frozen)
	ok := rate >= 0.03 && rate <= 0.20
	return checkResult{"frozen_broken", ok, fmt.Sprintf("P(BROKEN|FROZEN)=%.4f (want [0.03, 0.20]) n=%d", rate, frozen)}
}

func checkInProgress(rows []csvRow) checkResult {
	var nIP int
	nFrozenChains := 0
	nNoShow := 0
	seen := map[int]string{}
	for _, row := range rows {
		if row.stage == "IN_PROGRESS" {
			nIP++
		}
		if _, ok := seen[row.chainID]; ok {
			continue
		}
		var o oracle
		if err := json.Unmarshal([]byte(row.rawJSON), &o); err != nil {
			return checkResult{"in_progress", false, err.Error()}
		}
		seen[row.chainID] = o.Reason
		switch o.Reason {
		case "completed", "no_show", "item_mismatch":
			nFrozenChains++
			if o.Reason == "no_show" {
				nNoShow++
			}
		}
	}
	want := nFrozenChains - nNoShow
	ok := nIP > 0 && nIP == want
	return checkResult{
		"in_progress",
		ok,
		fmt.Sprintf("IN_PROGRESS rows=%d; frozen chains=%d no_show=%d (want rows = frozen−no_show = %d)", nIP, nFrozenChains, nNoShow, want),
	}
}

func checkVolume(rows []csvRow, nChains int) checkResult {
	nRows := len(rows)
	lo := int(math.Round(2.0 * float64(nChains)))
	hi := int(math.Round(3.0 * float64(nChains)))
	ok := nRows >= lo && nRows <= hi
	return checkResult{"volume", ok, fmt.Sprintf("%d chains / %d rows (want ~%d–%d rows)", nChains, nRows, lo, hi)}
}

func checkDeterminism(a, b []byte) checkResult {
	ok := bytesEqual(a, b)
	detail := "second generate(seed) matched byte-for-byte"
	if !ok {
		detail = fmt.Sprintf("mismatch: %d vs %d bytes", len(a), len(b))
	}
	return checkResult{"determinism", ok, detail}
}

func completedRate(rows []csvRow, stage string) float64 {
	var n, c int
	for _, row := range rows {
		if stage != "" && row.stage != stage {
			continue
		}
		n++
		if row.label == "COMPLETED" {
			c++
		}
	}
	if n == 0 {
		return math.NaN()
	}
	return float64(c) / float64(n)
}

func featIndex(name string) int {
	for i, n := range featureNames {
		if n == name {
			return i
		}
	}
	return -1
}

func parseFeatMap(row csvRow) (map[string]float64, error) {
	out := make(map[string]float64, len(featureNames))
	for i, name := range featureNames {
		x, err := parseFloat(row.feats[i])
		if err != nil {
			return nil, fmt.Errorf("%s: %w", name, err)
		}
		out[name] = x
	}
	return out, nil
}

func parseFloat(s string) (float64, error) {
	return strconv.ParseFloat(s, 64)
}

func bytesEqual(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func renderReport(seed int64, n int, outPath, reportPath string, rows []csvRow, checks []checkResult) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# Simulator report (synthetic_v1)\n\n")
	fmt.Fprintf(&b, "- seed: `%d`\n", seed)
	fmt.Fprintf(&b, "- n_chains: `%d`\n", n)
	fmt.Fprintf(&b, "- n_rows: `%d`\n", len(rows))
	fmt.Fprintf(&b, "- csv: `%s`\n", outPath)
	fmt.Fprintf(&b, "- report: `%s`\n\n", reportPath)

	fmt.Fprintf(&b, "## Self-checks\n\n")
	fmt.Fprintf(&b, "| check | status | detail |\n|---|---|---|\n")
	for _, c := range checks {
		st := "FAIL"
		if c.OK {
			st = "PASS"
		}
		fmt.Fprintf(&b, "| %s | %s | %s |\n", c.Name, st, escapeMD(c.Detail))
	}

	fmt.Fprintf(&b, "\n## Funnel (rows)\n\n")
	fmt.Fprintf(&b, "| stage | rows | P(COMPLETED) |\n|---|---:|---:|\n")
	for _, stage := range []string{"CANDIDATE", "PROPOSED", "FROZEN", "IN_PROGRESS"} {
		var nStage, nComp int
		for _, row := range rows {
			if row.stage != stage {
				continue
			}
			nStage++
			if row.label == "COMPLETED" {
				nComp++
			}
		}
		rate := 0.0
		if nStage > 0 {
			rate = float64(nComp) / float64(nStage)
		}
		fmt.Fprintf(&b, "| %s | %d | %.4f |\n", stage, nStage, rate)
	}

	var nComp, nBroken int
	seen := map[int]string{}
	// sorted iteration: collect ids then sort
	for _, row := range rows {
		if _, ok := seen[row.chainID]; !ok {
			seen[row.chainID] = row.label
		}
	}
	ids := make([]int, 0, len(seen))
	for id := range seen {
		ids = append(ids, id)
	}
	sort.Ints(ids)
	for _, id := range ids {
		if seen[id] == "COMPLETED" {
			nComp++
		} else {
			nBroken++
		}
	}
	fmt.Fprintf(&b, "\n## Labels (chains)\n\n")
	fmt.Fprintf(&b, "- COMPLETED: %d (%.4f)\n", nComp, float64(nComp)/float64(n))
	fmt.Fprintf(&b, "- BROKEN: %d (%.4f)\n", nBroken, float64(nBroken)/float64(n))

	reasons := map[string]int{}
	seenReason := map[int]struct{}{}
	for _, row := range rows {
		if _, ok := seenReason[row.chainID]; ok {
			continue
		}
		seenReason[row.chainID] = struct{}{}
		var o oracle
		if err := json.Unmarshal([]byte(row.rawJSON), &o); err != nil {
			continue
		}
		reasons[o.Reason]++
	}
	reasonKeys := make([]string, 0, len(reasons))
	for k := range reasons {
		reasonKeys = append(reasonKeys, k)
	}
	sort.Strings(reasonKeys)
	fmt.Fprintf(&b, "\n## Break reasons (chains)\n\n")
	for _, k := range reasonKeys {
		fmt.Fprintf(&b, "- %s: %d\n", k, reasons[k])
	}

	fmt.Fprintf(&b, "\n## Notes\n\n")
	fmt.Fprintf(&b, "- After FROZEN the funnel splits: `no_show` (no IN_PROGRESS row) vs ship to PVZ then `item_mismatch`/`completed`.\n")
	fmt.Fprintf(&b, "- Extra RNG draws after FROZEN change the CSV vs older simulator versions even at the same seed.\n")
	fmt.Fprintf(&b, "\n## Tests\n\n```bash\ncd ml/simulator && go test . -v\n```\n")
	return b.String()
}

func escapeMD(s string) string {
	return strings.ReplaceAll(s, "|", "\\|")
}
