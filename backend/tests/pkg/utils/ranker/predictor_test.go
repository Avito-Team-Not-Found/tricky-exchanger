package ranker_test

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/pkg/utils/ranker"
)

type goldenCase struct {
	Features map[string]float64 `json:"features"`
	Proba    float64            `json:"proba"`
}

func TestGoldenPredictMatchesNotebook(t *testing.T) {
	goldenPath := findUp(t, filepath.Join("ml", "golden", "golden_v1.json"))
	if goldenPath == "" {
		t.Skip("ml/golden/golden_v1.json not found")
	}
	raw, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatalf("read golden: %v", err)
	}
	var cases []goldenCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("parse golden: %v", err)
	}
	if len(cases) != 20 {
		t.Fatalf("golden pairs = %d, want 20", len(cases))
	}

	pred := mustPredictor(t)
	const tol = 1e-4
	for i, c := range cases {
		got, err := pred.Predict(c.Features)
		if err != nil {
			t.Fatalf("case %d: Predict: %v", i, err)
		}
		if diff := math.Abs(got - c.Proba); diff > tol {
			t.Fatalf("case %d: |Go-notebook|=%g > %g (go=%g notebook=%g)", i, diff, tol, got, c.Proba)
		}
	}
}

func TestFeaturesJsonMatchesGo(t *testing.T) {
	path := findUp(t, filepath.Join("ml", "features.json"))
	if path == "" {
		t.Fatal("ml/features.json not found")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read ml/features.json: %v", err)
	}
	var names []string
	if err := json.Unmarshal(raw, &names); err != nil {
		t.Fatalf("parse ml/features.json: %v", err)
	}
	if len(names) != len(ranker.FeatureNames) {
		t.Fatalf("feature count %d != %d", len(names), len(ranker.FeatureNames))
	}
	for i := range names {
		if names[i] != ranker.FeatureNames[i] {
			t.Fatalf("feature[%d] = %q, want %q", i, names[i], ranker.FeatureNames[i])
		}
	}
}

func TestModelTextIsV3(t *testing.T) {
	modelPath := findUp(t, filepath.Join("pkg", "utils", "ranker", "models", "ranker_v1.txt"))
	if modelPath == "" {
		t.Skip("model missing")
	}
	raw, err := os.ReadFile(modelPath)
	if err != nil {
		t.Fatalf("read model: %v", err)
	}
	head := string(raw)
	if len(head) > 400 {
		head = head[:400]
	}
	if !strings.Contains(head, "version=v3") {
		t.Fatalf("model header missing version=v3:\n%s", head)
	}
	if strings.Contains(head, "version=v4") {
		t.Fatalf("model still v4; native leaves load requires v3")
	}
}

func TestPredictP95Under1ms(t *testing.T) {
	pred := mustPredictor(t)
	feats := goldenLikeFeatures()
	const n = 400
	lat := make([]time.Duration, n)
	// warmup
	if _, err := pred.Predict(feats); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < n; i++ {
		start := time.Now()
		if _, err := pred.Predict(feats); err != nil {
			t.Fatal(err)
		}
		lat[i] = time.Since(start)
	}
	sort.Slice(lat, func(i, j int) bool { return lat[i] < lat[j] })
	p95 := lat[(n*95)/100]
	if p95 > time.Millisecond {
		t.Fatalf("Predict p95 = %v, want < 1ms", p95)
	}
}

func TestPredictConcurrent(t *testing.T) {
	pred := mustPredictor(t)
	feats := goldenLikeFeatures()
	var wg sync.WaitGroup
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 20; j++ {
				if _, err := pred.Predict(feats); err != nil {
					t.Error(err)
					return
				}
			}
		}()
	}
	wg.Wait()
}

func BenchmarkPredict(b *testing.B) {
	modelPath := findUp(b, filepath.Join("pkg", "utils", "ranker", "models", "ranker_v1.txt"))
	if modelPath == "" {
		b.Fatal("ranker model not found")
	}
	pred, err := ranker.NewLightGBMPredictor(modelPath)
	if err != nil {
		b.Skip(err.Error())
	}
	feats := goldenLikeFeatures()
	lat := make([]time.Duration, 0, b.N)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		start := time.Now()
		if _, err := pred.Predict(feats); err != nil {
			b.Fatal(err)
		}
		lat = append(lat, time.Since(start))
	}
	b.StopTimer()
	if len(lat) == 0 {
		return
	}
	sort.Slice(lat, func(i, j int) bool { return lat[i] < lat[j] })
	p95 := lat[(len(lat)*95)/100]
	b.ReportMetric(float64(p95.Microseconds()), "p95_us")
	if p95 > time.Millisecond {
		b.Fatalf("Predict p95 = %v, want < 1ms", p95)
	}
}

func mustPredictor(t testing.TB) *ranker.LightGBMPredictor {
	t.Helper()
	modelPath := findUp(t, filepath.Join("pkg", "utils", "ranker", "models", "ranker_v1.txt"))
	if modelPath == "" {
		t.Fatal("ranker model not found")
	}
	pred, err := ranker.NewLightGBMPredictor(modelPath)
	if err != nil {
		t.Fatalf("ranker.NewLightGBMPredictor: %v", err)
	}
	return pred
}

func goldenLikeFeatures() map[string]float64 {
	return map[string]float64{
		"match_mean":          0.56,
		"min_edge":            0.21,
		"edge_spread":         0.63,
		"liquidity_min":       0.5,
		"liquidity_mean":      0.94,
		"size_spread":         4,
		"count":               4,
		"progress":            0,
		"is_proposed":         0,
		"is_frozen":           0,
		"hours_since_created": 0,
		"hours_in_stage":      0,
		"vote_velocity":       0,
		"category_popularity": 0.54,
		"category_diversity":  0.75,
		"reliability_mean":    0.75,
	}
}

func findUp(t testing.TB, rel string) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 8; i++ {
		p := filepath.Join(dir, rel)
		if _, err := os.Stat(p); err == nil {
			return p
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return ""
}
