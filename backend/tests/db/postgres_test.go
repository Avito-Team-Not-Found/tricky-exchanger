package db_test

import (
	"context"
	"strings"
	"testing"

	database "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/database"
)

// TestConnect_UnreachableDB проверяет, что
// приложение возвращает понятную ошибку при недоступной БД.
func TestConnect_UnreachableDB(t *testing.T) {
	ctx := context.Background()
	// Порт 1 на localhost гарантированно закрыт — БД недоступна.
	_, err := database.Connect(ctx, "postgres://user:pass@127.0.0.1:1/nonexistent?sslmode=disable")

	if err == nil {
		t.Fatal("expected an error when DB is unreachable, got nil")
	}
	if !strings.Contains(err.Error(), "unreachable") {
		t.Fatalf("expected a clear 'unreachable' message, got: %v", err)
	}
}
