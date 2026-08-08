package matching

// RankerConfig — параметры линейной скоринг-головы FormulaRanker'а.
// Веса компонент в сумме дают 1; при значении 0 (или отрицательном) используется дефолт.
//
// Структура намеренно переиспользуется и для будущего LightGBM: компоненты — это
// фичи, а голова (FormulaRanker сейчас, LightGBM позже) ест один и тот же набор.
type RankerConfig struct {
	WeightMatch       float64 // вклад Match           (default 0.35)
	WeightReliability float64 // вклад Reliability     (default 0.20)
	WeightLiquidity   float64 // вклад Liquidity       (default 0.10)
	WeightProgress    float64 // вклад Progress        (default 0.15)
	WeightIsProposed  float64 // вклад is_proposed     (default 0.10)
	WeightIsFrozen    float64 // вклад is_frozen       (default 0.10)

	LiquidityCap       int     // CAP для насыщения Liquidity: min(1, minCluster/CAP) (default 4)
	ReliabilityDefault float64 // надёжность участника, если не передана (default 0.75)
}

// NewRankerConfig возвращает конфиг со значениями по умолчанию.
// Score в диапазоне [0,1]; формула (веса в сумме = 1):
//
//	score = wM·M + wR·R + wL·L + wP·P + wPo·is_proposed + wF·is_frozen
func NewRankerConfig() RankerConfig {
	return RankerConfig{
		WeightMatch:       0.35,
		WeightReliability: 0.20,
		WeightLiquidity:   0.10,
		WeightProgress:    0.15,
		WeightIsProposed:  0.10,
		WeightIsFrozen:    0.10,

		LiquidityCap:       4,
		ReliabilityDefault: 0.75,
	}
}

// normalize заполняет нулевые/отрицательные поля значениями по умолчанию.
func (c RankerConfig) normalize() RankerConfig {
	d := NewRankerConfig()
	if c.WeightMatch <= 0 {
		c.WeightMatch = d.WeightMatch
	}
	if c.WeightReliability <= 0 {
		c.WeightReliability = d.WeightReliability
	}
	if c.WeightLiquidity <= 0 {
		c.WeightLiquidity = d.WeightLiquidity
	}
	if c.WeightProgress <= 0 {
		c.WeightProgress = d.WeightProgress
	}
	if c.WeightIsProposed <= 0 {
		c.WeightIsProposed = d.WeightIsProposed
	}
	if c.WeightIsFrozen <= 0 {
		c.WeightIsFrozen = d.WeightIsFrozen
	}
	if c.LiquidityCap <= 0 {
		c.LiquidityCap = d.LiquidityCap
	}
	if c.ReliabilityDefault <= 0 {
		c.ReliabilityDefault = d.ReliabilityDefault
	}
	return c
}
