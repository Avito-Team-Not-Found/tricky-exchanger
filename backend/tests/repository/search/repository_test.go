package search_test

import (
	"testing"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository/search"
)

func TestNew(t *testing.T) {
	if search.New(nil) == nil {
		t.Fatal("New(nil) returned nil")
	}
}
