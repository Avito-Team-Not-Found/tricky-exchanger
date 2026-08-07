// Package reservation содержит проверку активных hard-резерваций товара.
package reservation

import "context"

// StubChecker — временная заглушка до появления полноценной фичи цепочек обмена
// (chains/chain_participants). Пока резерваций не существует физически,
// поэтому товар никогда не считается захваченным.
type StubChecker struct{}

// NewStubChecker создаёт заглушку проверки hard-резерваций.
func NewStubChecker() *StubChecker {
	return &StubChecker{}
}

// HasActiveHardReservation всегда возвращает false в режиме заглушки.
func (StubChecker) HasActiveHardReservation(_ context.Context, _ int64) (bool, error) {
	return false, nil
}
