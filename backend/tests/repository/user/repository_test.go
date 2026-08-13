package user_test

import (
	"testing"

	userrepo "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository/user"
)

func TestNewRepository(t *testing.T) {
	if userrepo.NewRepository(nil) == nil {
		t.Fatal("NewRepository(nil) returned nil")
	}
}
