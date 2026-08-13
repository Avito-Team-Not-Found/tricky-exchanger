package exchange_offer_test

import (
	"testing"

	offerrepo "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository/exchange_offer"
)

func TestNewRepository(t *testing.T) {
	if offerrepo.NewRepository(nil) == nil {
		t.Fatal("NewRepository(nil) returned nil")
	}
}
