// Package reservation — проверка hard-резерваций товара.
package reservation

import "context"

// StubChecker всегда возвращает false (резервации через этот пакет не используются).
type StubChecker struct{}

func NewStubChecker() *StubChecker { return &StubChecker{} }

func (StubChecker) HasActiveHardReservation(_ context.Context, _ int64) (bool, error) {
	return false, nil
}
