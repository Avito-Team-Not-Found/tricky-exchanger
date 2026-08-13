package ranker

import (
	"errors"
	"time"
)

// ErrInvalidChainState — Count < 2 или ApprovedVotes вне [0, Count].
var ErrInvalidChainState = errors.New("invalid chain state: Count must be >= 2 and ApprovedVotes must be in [0, Count]")

// ChainStateStatus — этап жизненного цикла цепочки для скоринга.
// Свой изолированный enum: Ranker не зависит от entity.ChainStatus,
// при интеграции адаптер маппит статус цепочки -> ChainStateStatus.
type ChainStateStatus string

const (
	ChainStateCandidate  ChainStateStatus = "CANDIDATE"
	ChainStateProposed   ChainStateStatus = "PROPOSED"
	ChainStateFrozen     ChainStateStatus = "FROZEN"
	ChainStateInProgress ChainStateStatus = "IN_PROGRESS"
	ChainStateCompleted  ChainStateStatus = "COMPLETED"
	ChainStateBroken     ChainStateStatus = "BROKEN"
)

// StateEvent — какое действие случилось с цепочкой. Нужен, чтобы вызвать
// «правильный» ScoreForX из внедрённого матчера и задокументировать смысл пересчёта.
type StateEvent string

const (
	EventAdd         StateEvent = "ADD"         // создана/добавлена заявка
	EventDelete      StateEvent = "DELETE"      // удалена заявка
	EventModify      StateEvent = "MODIFY"      // изменена заявка (= delete + add)
	EventRespond     StateEvent = "RESPOND"     // отклик (появляется голос)
	EventConfirm     StateEvent = "CONFIRM"     // подтверждение
	EventDecline     StateEvent = "DECLINE"     // отказ
	EventReplacement StateEvent = "REPLACEMENT" // быстрая замена участника
)

// ChainState — отвязанный снапшот цепочки + произошедшее действие + прошлый score.
// Ranker пересчитывает score целиком из этого состояния (никаких += / -=):
// прошлый score — такой же вход, как length/stage/event, а не накапливаемое значение.
type ChainState struct {
	Count int // число участников в цепочке (Length)

	// Stage — этап цепочки (см. ChainStateStatus).
	Stage ChainStateStatus
	// Event — действие, которое вызвало пересчёт (см. StateEvent).
	Event StateEvent

	// EdgeCosines — по одному значению на ребро A->B (косинусное подобие, [-1,1]).
	// Длина = Count. Пустой срез при Count >= 2 трактуется как Match = 0 (не ошибка).
	EdgeCosines []float64

	// ParticipantReliability — надёжность каждого участника, [0,1].
	// Длина = Count. Элементы <= 0 заменяются на cfg.ReliabilityDefault.
	ParticipantReliability []float64

	// ParticipantClusterSizes — размер кластера каждого участника (число member-заявок).
	// Длина = Count. Используется для Liquidity. Пустой срез -> Liquidity = 0.
	ParticipantClusterSizes []int

	// ApprovedVotes — число голосов "approved" среди участников, [0, Count].
	ApprovedVotes int

	// PrevScore — прошлое значение score (вход правила/нормировки, не слагаемое).
	PrevScore float64

	// Поля ниже нужны ML-голове (16 фич). FormulaRanker их игнорирует:
	// веса и сабсет ExtractFeatures не меняются.

	// Now — момент скоринга. Нулевое значение → time.Now() в ExtractMLFeatures.
	Now time.Time
	// CreatedAt — chains.created_at (для ADD — время сборки драфта).
	CreatedAt time.Time
	// StageEnteredAt — вход в текущую стадию (created_at или последний голос).
	StageEnteredAt time.Time
	// VoteTimes — COALESCE(voted_at, created_at) голосов цепочки, по возрастанию.
	VoteTimes []time.Time
	// OfferedCategories / WantedCategories — join заявка→товар, длина = Count.
	OfferedCategories []string
	WantedCategories  []string
	// CategoryCounts — число ACTIVE-товаров по категории (кэш каталога).
	CategoryCounts map[string]int
	CategoryTotal  int
}

// ChainFeatures — извлечённые из ChainState компоненты (все в [0,1]).
// Это фичи для скоринг-головы: сейчас FormulaRanker, позже LightGBM с тем же набором.
type ChainFeatures struct {
	Match       float64
	Reliability float64
	Liquidity   float64
	Progress    float64
	IsProposed  int // 0 или 1
	IsFrozen    int // 0 или 1
}

// ExtractFeatures превращает ChainState в компоненты-фичи. Валидирует вход
// (Count >= 2, ApprovedVotes в [0, Count]) и возвращает ErrInvalidChainState
// при несоответствии.
func ExtractFeatures(s ChainState, cfg RankerConfig) (ChainFeatures, error) {
	cfg = cfg.normalize()

	if s.Count < 2 {
		return ChainFeatures{}, ErrInvalidChainState
	}
	if s.ApprovedVotes < 0 || s.ApprovedVotes > s.Count {
		return ChainFeatures{}, ErrInvalidChainState
	}

	f := ChainFeatures{}

	// Match: среднее по рёбрам (cos+1)/2. Пустые рёбра при Count >= 2 -> 0 (документировано).
	if len(s.EdgeCosines) >= 2 {
		var sum float64
		for _, c := range s.EdgeCosines {
			sum += (c + 1) / 2
		}
		f.Match = sum / float64(len(s.EdgeCosines))
	}

	// Reliability: средняя надёжность участников; элементы <= 0 -> ReliabilityDefault.
	switch {
	case len(s.ParticipantReliability) == 0:
		f.Reliability = cfg.ReliabilityDefault
	default:
		var sum float64
		for _, r := range s.ParticipantReliability {
			if r <= 0 {
				r = cfg.ReliabilityDefault
			}
			sum += r
		}
		f.Reliability = sum / float64(len(s.ParticipantReliability))
	}

	// Liquidity: насыщение min(1, minClusterSize/CAP). Пустые размеры -> 0.
	if len(s.ParticipantClusterSizes) > 0 {
		minSize := s.ParticipantClusterSizes[0]
		for _, sz := range s.ParticipantClusterSizes[1:] {
			if sz < minSize {
				minSize = sz
			}
		}
		f.Liquidity = float64(minSize) / float64(cfg.LiquidityCap)
		if f.Liquidity > 1 {
			f.Liquidity = 1
		}
	}

	// Progress: approvedVotes / Count (Count > 0 гарантирован валидацией).
	if s.Count > 0 {
		f.Progress = float64(s.ApprovedVotes) / float64(s.Count)
	}

	// Флаги этапов.
	switch s.Stage {
	case ChainStateProposed, ChainStateFrozen, ChainStateInProgress, ChainStateCompleted:
		f.IsProposed = 1
	}
	switch s.Stage {
	case ChainStateFrozen, ChainStateInProgress, ChainStateCompleted:
		f.IsFrozen = 1
	}

	return f, nil
}
