package item_test

import (
	"testing"

	itemservice "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/item"
)

func TestNormalizePaginationDefaultsAndCaps(t *testing.T) {
	page, size := itemservice.NormalizePagination(0, 0)
	if page != 1 || size != 20 {
		t.Fatalf("defaults = %d/%d, want 1/20", page, size)
	}
	page, size = itemservice.NormalizePagination(3, 1000)
	if page != 3 || size != 100 {
		t.Fatalf("capped = %d/%d, want 3/100", page, size)
	}
}
