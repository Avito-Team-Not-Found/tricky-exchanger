package matching

import (
	"context"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

// CandidateValidator применяет точную бизнес-проверку к кандидатам, найденным pgvector.
//
// pgvector отдаёт только "сырые" семантические находки (задача SCRUM-24). Поверх неё
// здесь отсекаются:
//   - кандидаты ниже бизнес-порога (если SQL-порог оказался ниже конфигурируемого);
//   - собственные записи пользователя (нельзя обмениваться самому с собой);
//   - дубликаты одного request_id (одна заявка не должна дважды попадать в цепочку).
//
// Так выполняется требование "последующая точная бизнес-проверка в Go": SQL отдаёт
// экземпляры для сужения, а окончательное решение о пригодности принимается здесь.
type CandidateValidator struct {
	threshold float64
}

// NewCandidateValidator создаёт валидатор с бизнес-порогом подобия.
func NewCandidateValidator(threshold float64) *CandidateValidator {
	return &CandidateValidator{threshold: threshold}
}

// Validate отбрасывает запрещённые кандидаты и возвращает чистое множество.
// forUserID — пользователь, для которого считается мэтчинг (свои записи исключаются).
func (v *CandidateValidator) Validate(_ context.Context, candidates []entity.Candidate, forUserID string) []entity.Candidate {
	seen := make(map[int64]struct{}, len(candidates))
	result := make([]entity.Candidate, 0, len(candidates))

	for _, c := range candidates {
		// 1. Порог подобия — финальное слово по допуску.
		if c.Score < v.threshold {
			continue
		}
		// 2. Свои заявки/предметы исключаем: бартер тройной, но не с самим собой.
		if c.OwnerID == forUserID {
			continue
		}
		// 3. Дедупликация по request_id — одна заявка входит в цепочку один раз.
		if _, dup := seen[c.RequestID]; dup {
			continue
		}
		seen[c.RequestID] = struct{}{}
		result = append(result, c)
	}
	return result
}
