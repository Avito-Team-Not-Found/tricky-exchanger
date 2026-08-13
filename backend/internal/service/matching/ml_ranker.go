package matching

import (
	"fmt"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/pkg/utils/ranker"
)

const (
	RankerModeFormula = "formula"
	RankerModeML      = "ml"
)

// MLRanker считает score через LightGBM. Ошибки Predict/Extract уходят наверх,
// без переключения на формулу.
type MLRanker struct {
	pred ranker.Predictor
	cfg  ranker.RankerConfig
}

// NewMLRanker требует уже загруженный предиктор (fail-fast — на NewRuntimeRanker).
func NewMLRanker(pred ranker.Predictor) (*MLRanker, error) {
	if pred == nil {
		return nil, fmt.Errorf("ml ranker predictor is nil")
	}
	return &MLRanker{pred: pred, cfg: ranker.NewRankerConfig()}, nil
}

// NewRuntimeRanker выбирает голову по режиму. При mode=ml грузит модель сразу:
// битый файл или рассинхрон feature_names модели с FeatureNames — ошибка, без деградации на формулу.
func NewRuntimeRanker(mode, modelPath string) (ranker.Ranker, error) {
	switch mode {
	case RankerModeFormula:
		return ranker.NewFormulaRanker(ranker.NewRankerConfig()), nil
	case RankerModeML:
		pred, err := ranker.NewLightGBMPredictor(modelPath)
		if err != nil {
			return nil, fmt.Errorf("load lightgbm model: %w", err)
		}
		return NewMLRanker(pred)
	default:
		return nil, fmt.Errorf("unknown ranker mode %q", mode)
	}
}

// Score: ExtractMLFeatures → Predict. Ошибку не глотает.
func (m *MLRanker) Score(s ranker.ChainState) (float64, error) {
	if m == nil || m.pred == nil {
		return 0, fmt.Errorf("ml ranker is not initialized")
	}
	feats, err := ranker.ExtractMLFeatures(s, m.cfg)
	if err != nil {
		return 0, err
	}
	p, err := m.pred.Predict(feats)
	if err != nil {
		return 0, err
	}
	if p < 0 {
		p = 0
	}
	if p > 1 {
		p = 1
	}
	return p, nil
}
