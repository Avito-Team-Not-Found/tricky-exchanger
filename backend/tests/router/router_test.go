package router_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	router "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/router"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	chainHandler "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/handler/chain"
	exchangeOfferHandler "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/handler/exchange_offer"
	itemHandler "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/handler/item"
	userHandler "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/handler/user"
	exchangeOfferService "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/exchange_offer"
	itemService "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/item"
)

// stubUserService — заглушка Service для тестов роутера: важна только маршрутизация,
// а не поведение фичи (оно проверяется отдельно в tests/service и tests/handler).
type stubUserService struct{}

func (stubUserService) Register(_ context.Context, fullName, email, _ string) (*entity.User, string, error) {
	return &entity.User{FullName: fullName, Email: email}, "stub-token", nil
}

func (stubUserService) Login(_ context.Context, email, _ string) (*entity.User, string, error) {
	return &entity.User{Email: email}, "stub-token", nil
}

func (stubUserService) Me(_ context.Context, userID uuid.UUID) (*entity.User, error) {
	return &entity.User{ID: userID}, nil
}

func (stubUserService) ChangePassword(_ context.Context, _ uuid.UUID, _, _ string) error {
	return nil
}

func (stubUserService) SendRecoveryCode(_ context.Context, _ string) error {
	return nil
}

func (stubUserService) VerifyRecoveryCode(_ context.Context, _, _ string) error {
	return nil
}

func (stubUserService) ResetPassword(_ context.Context, _, _, _ string) error {
	return nil
}

// stubTokenParser — заглушка middleware.TokenParser для тестов роутера.
type stubTokenParser struct{}

func (stubTokenParser) Parse(_ string) (uuid.UUID, error) {
	return uuid.New(), nil
}

func newTestEngine() *gin.Engine {
	return router.New(
		stubTokenParser{},
		router.NewPingHandler(),
		userHandler.NewHandler(stubUserService{}),
		exchangeOfferHandler.NewHandler(stubExchangeOfferService{}),
		itemHandler.NewHandler(stubItemService{}),
		chainHandler.NewHandler(stubChainService{}),
	)
}

type stubChainService struct{}

func (stubChainService) List(_ context.Context, _ string) ([]entity.Chain, error) {
	return []entity.Chain{}, nil
}

func (stubChainService) ListForOffer(_ context.Context, _ string, _ int64) ([]entity.Chain, error) {
	return []entity.Chain{}, nil
}

func (stubChainService) Get(_ context.Context, _ string, _ int64) (entity.Chain, error) {
	return entity.Chain{}, entity.ErrChainNotFound
}

type stubExchangeOfferService struct{}

func (stubExchangeOfferService) Create(_ context.Context, _ string, _ exchangeOfferService.CreateInput) (entity.ExchangeOffer, error) {
	return entity.ExchangeOffer{}, nil
}

func (stubExchangeOfferService) Get(_ context.Context, _ string, _ int64) (entity.ExchangeOffer, error) {
	return entity.ExchangeOffer{}, nil
}

func (stubExchangeOfferService) List(_ context.Context, _ string) ([]entity.ExchangeOfferListItem, error) {
	return nil, nil
}

func (stubExchangeOfferService) Update(_ context.Context, _ string, _ int64, _ exchangeOfferService.UpdateInput) (entity.ExchangeOffer, error) {
	return entity.ExchangeOffer{}, nil
}

func (stubExchangeOfferService) Delete(_ context.Context, _ string, _ int64, _ int64) error {
	return nil
}

type stubItemService struct{}

func (stubItemService) Create(_ context.Context, ownerID uuid.UUID, _ itemService.CreateInput) (*entity.Item, error) {
	return &entity.Item{OwnerUserID: ownerID}, nil
}

func (stubItemService) Get(_ context.Context, _ uuid.UUID, _ int64) (*entity.Item, error) {
	return &entity.Item{}, nil
}

func (stubItemService) List(_ context.Context, _ uuid.UUID, _, _ int) ([]*entity.Item, int, error) {
	return nil, 0, nil
}

func (stubItemService) Update(_ context.Context, _ uuid.UUID, _ int64, _ itemService.UpdateInput) (*entity.Item, error) {
	return &entity.Item{}, nil
}

func (stubItemService) Archive(_ context.Context, _ uuid.UUID, _ int64) error {
	return nil
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

func TestLogin_RouteRegistered(t *testing.T) {
	gin.SetMode(gin.TestMode)

	engine := newTestEngine()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
	rec := httptest.NewRecorder()

	engine.ServeHTTP(rec, req)

	if rec.Code == http.StatusNotFound {
		t.Fatalf("expected /api/v1/auth/login to be registered, got 404")
	}
}

func TestExchangeOffers_RequiresAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)

	engine := newTestEngine()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/exchange-offers", nil)
	rec := httptest.NewRecorder()

	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected status %d for /api/v1/exchange-offers without Authorization header, got %d", http.StatusUnauthorized, rec.Code)
	}
}

func TestItems_RequiresAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)

	engine := newTestEngine()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/items", nil)
	rec := httptest.NewRecorder()

	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected status %d for /api/v1/items without Authorization header, got %d", http.StatusUnauthorized, rec.Code)
	}
}

func TestChains_RequiresAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)

	engine := newTestEngine()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/chains", nil)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected status %d for /api/v1/chains without Authorization header, got %d", http.StatusUnauthorized, rec.Code)
	}
}

func TestMe_RequiresAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)

	engine := newTestEngine()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	rec := httptest.NewRecorder()

	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected status %d without Authorization header, got %d", http.StatusUnauthorized, rec.Code)
	}
}

func TestMe_WithAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)

	engine := newTestEngine()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	req.Header.Set("Authorization", "Bearer any-token")
	rec := httptest.NewRecorder()

	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d with Authorization header, got %d", http.StatusOK, rec.Code)
	}
}

func TestPasswordRecovery_RoutesRegistered(t *testing.T) {
	gin.SetMode(gin.TestMode)

	engine := newTestEngine()

	for _, path := range []string{
		"/api/v1/account/password-recovery/send-code/",
		"/api/v1/account/password-recovery/verify-code/",
		"/api/v1/account/password-recovery/reset-password/",
	} {
		req := httptest.NewRequest(http.MethodPost, path, nil)
		rec := httptest.NewRecorder()

		engine.ServeHTTP(rec, req)

		if rec.Code == http.StatusNotFound {
			t.Fatalf("expected %s to be registered, got 404", path)
		}
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
