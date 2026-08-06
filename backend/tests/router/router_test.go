package router_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	router "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/router"
)

func TestPingHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)

	engine := router.New(router.NewPingHandler())

	req := httptest.NewRequest(http.MethodGet, "/api/v1/ping", nil)
	rec := httptest.NewRecorder()

	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	const expectedBody = `{"message":"pong","status":"ok"}`
	if rec.Body.String() != expectedBody {
		t.Fatalf("expected body %q, got %q", expectedBody, rec.Body.String())
	}
}

func TestHealthz(t *testing.T) {
	gin.SetMode(gin.TestMode)

	engine := router.New(router.NewPingHandler())

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()

	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rec.Code)
	}
}
