package user_test

import (
	"net/http"
	"testing"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

func TestLogin_Success(t *testing.T) {
	engine := newEngine(&fakeService{token: "signed-jwt"})

	rec := doJSON(engine, http.MethodPost, "/api/v1/auth/login", map[string]any{
		"email":    "ivan@example.com",
		"password": "supersecret",
	}, false)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, rec.Code, rec.Body.String())
	}
}

func TestLogin_InvalidCredentials(t *testing.T) {
	engine := newEngine(&fakeService{err: entity.ErrInvalidCredentials})

	rec := doJSON(engine, http.MethodPost, "/api/v1/auth/login", map[string]any{
		"email":    "ivan@example.com",
		"password": "wrong",
	}, false)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected status %d, got %d", http.StatusUnauthorized, rec.Code)
	}
}

func TestLogin_InvalidBody(t *testing.T) {
	engine := newEngine(&fakeService{})

	rec := doJSON(engine, http.MethodPost, "/api/v1/auth/login", map[string]any{
		"email": "not-an-email",
	}, false)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected status %d, got %d", http.StatusUnprocessableEntity, rec.Code)
	}
}
