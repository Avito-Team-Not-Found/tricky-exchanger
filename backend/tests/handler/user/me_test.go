package user_test

import (
	"net/http"
	"testing"

	"github.com/google/uuid"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

func TestMe_Success(t *testing.T) {
	engine := newEngine(&fakeService{
		meUser: &entity.User{ID: uuid.New(), FullName: "Ivan", Email: "ivan@example.com"},
	})

	rec := doJSON(engine, http.MethodGet, "/api/v1/auth/me", nil, true)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, rec.Code, rec.Body.String())
	}
}

func TestMe_Unauthorized_NoToken(t *testing.T) {
	engine := newEngine(&fakeService{})

	rec := doJSON(engine, http.MethodGet, "/api/v1/auth/me", nil, false)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected status %d, got %d", http.StatusUnauthorized, rec.Code)
	}
}

func TestMe_NotFound(t *testing.T) {
	engine := newEngine(&fakeService{meErr: entity.ErrUserNotFound})

	rec := doJSON(engine, http.MethodGet, "/api/v1/auth/me", nil, true)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d", http.StatusNotFound, rec.Code)
	}
}
