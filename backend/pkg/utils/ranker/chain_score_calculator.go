package ranker

import "math"

// Ranker — калькулятор score цепочки бартерного обмена.
// Получает текущее состояние (ChainState) и возвращает новый score в [0, 1].
// Чистая функция от состояния: никаких += / -=, score пересчитывается целиком,
// и потому не "накапливается" (отклик добавляет столько же, сколько убирает его отмена).
//
// Интерфейс пока без context.Context — позже, при внедрении LightGBM, по нему
// пройдёмся и добавим ctx (будет другой голова с тем же контрактом, без изменения
// вызывающего кода и ScoreFor*).
type Ranker interface {
	Score(s ChainState) (float64, error)
}

// ChainScoreCalculator — реализация Ranker: линейная скоринг-голова поверх фич.
// (Это «тот самый score цепочки» вместо заглушки.)
type ChainScoreCalculator struct {
	cfg RankerConfig
}

// FormulaRanker — имя линейной головы в ТЗ-3. Веса и сабсет фич не меняются.
type FormulaRanker = ChainScoreCalculator

// NewFormulaRanker — алиас NewChainScoreCalculator.
func NewFormulaRanker(cfg RankerConfig) *FormulaRanker {
	return NewChainScoreCalculator(cfg)
}

// NewChainScoreCalculator создаёт калькулятор score. cfg нормализуется дефолтами.
func NewChainScoreCalculator(cfg RankerConfig) *ChainScoreCalculator {
	return &ChainScoreCalculator{cfg: cfg.normalize()}
}

// Score пересчитывает score целиком из состояния s и возвращает его в [0,1].
// Формула (веса в сумме 1, все компоненты в [0,1]):
//
//	raw = wM·Match + wR·Reliability + wL·Liquidity + wP·Progress
//	      + wPo·IsProposed + wF·IsFrozen
//
// затем clamp в [0,1] и округление до 4 знаков.
func (c *ChainScoreCalculator) Score(s ChainState) (float64, error) {
	// PrevScore мы не используем как += / -=; он оставлен как вход правила/нормировки.
	feats, err := ExtractFeatures(s, c.cfg)
	if err != nil {
		return 0, err
	}

	raw := c.cfg.WeightMatch*feats.Match +
		c.cfg.WeightReliability*feats.Reliability +
		c.cfg.WeightLiquidity*feats.Liquidity +
		c.cfg.WeightProgress*feats.Progress +
		c.cfg.WeightIsProposed*float64(feats.IsProposed) +
		c.cfg.WeightIsFrozen*float64(feats.IsFrozen)

	scaled := raw
	if scaled < 0 {
		scaled = 0
	}
	if scaled > 1 {
		scaled = 1
	}
	return math.Round(scaled*1e4) / 1e4, nil
}

// --- Ситуационные методы: удобный фасад для других разработчиков. ---
// Каждый метод проставляет нужное событие (Event) и делегирует в Score, единое ядро.
// Все методы — чистые: передай текущее состояние (после действия) и получи score.

// ScoreForAdd — создание/добавление заявки в цепочку -> пересчёт M, R, L.
func (c *ChainScoreCalculator) ScoreForAdd(s ChainState) (float64, error) {
	s.Event = EventAdd
	return c.Score(s)
}

// ScoreForDelete — удаление заявки -> пересчёт M, R, L без выбывшей.
// Обратная операция к Add: передай состояние уже без участника.
func (c *ChainScoreCalculator) ScoreForDelete(s ChainState) (float64, error) {
	s.Event = EventDelete
	return c.Score(s)
}

// ScoreForModify — изменение заявки (деп-заявка удалить+создать) -> M, R, L.
func (c *ChainScoreCalculator) ScoreForModify(s ChainState) (float64, error) {
	s.Event = EventModify
	return c.Score(s)
}

// ScoreForRespond — отклик -> пересчёт P (+ is_proposed при замыкании цепи).
// Отклик добавляет голос: передай State уже с увеличенным ApprovedVotes.
func (c *ChainScoreCalculator) ScoreForRespond(s ChainState) (float64, error) {
	s.Event = EventRespond
	return c.Score(s)
}

// ScoreForConfirm — подтверждение -> пересчёт P (+ is_frozen при полной заморозке).
func (c *ChainScoreCalculator) ScoreForConfirm(s ChainState) (float64, error) {
	s.Event = EventConfirm
	return c.Score(s)
}

// ScoreForDecline — отказ/отмена отклика -> пересчёт P.
// Обратная операция к Respond: передай State уже с уменьшенным ApprovedVotes.
func (c *ChainScoreCalculator) ScoreForDecline(s ChainState) (float64, error) {
	s.Event = EventDecline
	return c.Score(s)
}

// ScoreForReplacement — быстрая замена участника (вычесть одного + добавить другого)
// -> пересчёт M, R, L с новым участником.
func (c *ChainScoreCalculator) ScoreForReplacement(s ChainState) (float64, error) {
	s.Event = EventReplacement
	return c.Score(s)
}
