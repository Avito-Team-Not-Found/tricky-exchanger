package chain_test

import (
	"testing"

	chainrepo "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository/chain"
)

func TestNewRepository(t *testing.T) {
	if chainrepo.NewRepository(nil) == nil {
		t.Fatal("NewRepository(nil) returned nil")
	}
	if chainrepo.NewRepository(nil, 0.42) == nil {
		t.Fatal("NewRepository(nil, threshold) returned nil")
	}
}
