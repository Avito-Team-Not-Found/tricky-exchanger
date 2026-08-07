package user_test

import (
	"net/http"
	"testing"
)

func TestLogout_Success(t *testing.T) {
	engine := newEngine(&fakeService{})

	rec := doJSON(engine, http.MethodPost, "/api/v1/auth/logout", nil, true)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, rec.Code, rec.Body.String())
	}
}

func TestLogout_Unauthorized_NoToken(t *testing.T) {
	engine := newEngine(&fakeService{})

	rec := doJSON(engine, http.MethodPost, "/api/v1/auth/logout", nil, false)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected status %d, got %d", http.StatusUnauthorized, rec.Code)
	}
}
