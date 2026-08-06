package router_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	router "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/router"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	userHandler "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/handler/user"
)

// stubUserService — заглушка Service для тестов роутера: важна только маршрутизация,
// а не поведение фичи (оно проверяется отдельно в tests/service и tests/handler).
type stubUserService struct{}

func (stubUserService) Register(_ context.Context, fullName, email, _ string) (*entity.User, string, error) {
	return &entity.User{FullName: fullName, Email: email}, "stub-token", nil
}

func newTestEngine() *gin.Engine {
	return router.New(router.NewPingHandler(), userHandler.NewHandler(stubUserService{}))
}

func TestPingHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)

	engine := newTestEngine()

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

	engine := newTestEngine()

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()

	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rec.Code)
	}
}
