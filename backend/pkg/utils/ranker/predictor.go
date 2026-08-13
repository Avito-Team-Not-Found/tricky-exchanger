package ranker

import (
	"bufio"
	"fmt"
	"os"
	"strings"
	"sync"

	"github.com/dmitryikh/leaves"
)

// Predictor — инференс LightGBM. Ошибки возвращаются, паники нет.
type Predictor interface {
	Predict(features map[string]float64) (float64, error)
}

// LightGBMPredictor грузит модель один раз и предсказывает по map фич.
type LightGBMPredictor struct {
	model *leaves.Ensemble
	names []string
	mu    sync.Mutex
}

// NewLightGBMPredictor читает LightGBM text и сверяет feature_names заголовка
// с скомпилированным FeatureNames. Рассинхрон — ошибка (fail-fast на старте).
func NewLightGBMPredictor(modelPath string) (*LightGBMPredictor, error) {
	if modelPath == "" {
		return nil, fmt.Errorf("ranker model path is empty")
	}

	modelNames, err := parseModelFeatureNames(modelPath)
	if err != nil {
		return nil, err
	}
	if err := featureNamesEqual(modelNames, FeatureNames); err != nil {
		return nil, fmt.Errorf("model vs compiled FeatureNames: %w", err)
	}

	ensemble, err := leaves.LGEnsembleFromFile(modelPath, true)
	if err != nil {
		return nil, fmt.Errorf("load lightgbm model %s: %w", modelPath, err)
	}
	if ensemble.NFeatures() != len(FeatureNames) {
		return nil, fmt.Errorf(
			"model n_features=%d, FeatureNames has %d names",
			ensemble.NFeatures(), len(FeatureNames),
		)
	}

	return &LightGBMPredictor{model: ensemble, names: append([]string(nil), FeatureNames...)}, nil
}

// Predict возвращает P(completed) после sigmoid. Конкурентно безопасен.
func (p *LightGBMPredictor) Predict(features map[string]float64) (proba float64, err error) {
	if p == nil || p.model == nil {
		return 0, fmt.Errorf("lightgbm predictor is not loaded")
	}
	defer func() {
		if rec := recover(); rec != nil {
			err = fmt.Errorf("lightgbm predict panic: %v", rec)
			proba = 0
		}
	}()

	fvals := make([]float64, len(p.names))
	for i, name := range p.names {
		v, ok := features[name]
		if !ok {
			return 0, fmt.Errorf("missing feature %q", name)
		}
		fvals[i] = v
	}

	out := make([]float64, 1)
	p.mu.Lock()
	predErr := p.model.Predict(fvals, 0, out)
	p.mu.Unlock()
	if predErr != nil {
		return 0, predErr
	}
	return out[0], nil
}

func parseModelFeatureNames(path string) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open model %s: %w", path, err)
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "feature_names=") {
			fields := strings.Fields(strings.TrimPrefix(line, "feature_names="))
			if len(fields) == 0 {
				return nil, fmt.Errorf("empty feature_names in %s", path)
			}
			return fields, nil
		}
		if strings.HasPrefix(line, "Tree=") {
			break
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scan model %s: %w", path, err)
	}
	return nil, fmt.Errorf("feature_names not found in %s", path)
}

func featureNamesEqual(got, want []string) error {
	if len(got) != len(want) {
		return fmt.Errorf("feature_names length: got %d, expected %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			return fmt.Errorf("feature_names mismatch at %d: got %q, want %q", i, got[i], want[i])
		}
	}
	return nil
}
