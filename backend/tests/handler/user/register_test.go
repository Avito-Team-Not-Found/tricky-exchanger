package user_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	userHandler "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/handler/user"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/middleware"
)

// fakeService — заглушка handler-контракта Service, общая для всех тестов пакета.
// Каждый тест заполняет только те поля, что относятся к вызываемому методу.
type fakeService struct {
	user  *entity.User
	token string
	err   error

	meUser *entity.User
	meErr  error

	changePasswordErr error

	sendRecoveryCodeErr   error
	verifyRecoveryCodeErr error
	resetPasswordErr      error
}

func (f *fakeService) Register(_ context.Context, fullName, email, _ string) (*entity.User, string, error) {
	if f.err != nil {
		return nil, "", f.err
	}
	if f.user != nil {
		return f.user, f.token, nil
	}
	return &entity.User{FullName: fullName, Email: email}, f.token, nil
}

func (f *fakeService) Login(_ context.Context, email, _ string) (*entity.User, string, error) {
	if f.err != nil {
		return nil, "", f.err
	}
	if f.user != nil {
		return f.user, f.token, nil
	}
	return &entity.User{Email: email}, f.token, nil
}

func (f *fakeService) Me(_ context.Context, _ uuid.UUID) (*entity.User, error) {
	return f.meUser, f.meErr
}

func (f *fakeService) ChangePassword(_ context.Context, _ uuid.UUID, _, _ string) error {
	return f.changePasswordErr
}

func (f *fakeService) SendRecoveryCode(_ context.Context, _ string) error {
	return f.sendRecoveryCodeErr
}

func (f *fakeService) VerifyRecoveryCode(_ context.Context, _, _ string) error {
	return f.verifyRecoveryCodeErr
}

func (f *fakeService) ResetPassword(_ context.Context, _, _, _ string) error {
	return f.resetPasswordErr
}

// fakeParser — заглушка middleware.TokenParser: не проверяет строку токена,
// просто возвращает предопределённые userID/err.
type fakeParser struct {
	userID uuid.UUID
	err    error
}

func (f fakeParser) Parse(_ string) (uuid.UUID, error) {
	return f.userID, f.err
}

func newEngine(svc *fakeService) *gin.Engine {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	h := userHandler.NewHandler(svc)
	engine.POST("/api/v1/auth/register", h.Register)
	engine.POST("/api/v1/auth/login", h.Login)

	protected := engine.Group("/api/v1/auth", middleware.Auth(fakeParser{userID: uuid.New()}))
	protected.GET("/me", h.Me)
	protected.POST("/change-password", h.ChangePassword)
	protected.POST("/logout", h.Logout)

	recovery := engine.Group("/api/v1/account/password-recovery")
	recovery.POST("/send-code/", h.SendRecoveryCode)
	recovery.POST("/verify-code/", h.VerifyRecoveryCode)
	recovery.POST("/reset-password/", h.ResetPassword)

	return engine
}

func doJSON(engine *gin.Engine, method, path string, body map[string]any, withAuth bool) *httptest.ResponseRecorder {
	payload, _ := json.Marshal(body)
	req := httptest.NewRequest(method, path, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	if withAuth {
		req.Header.Set("Authorization", "Bearer irrelevant-for-fake-parser")
	}
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	return rec
}

func doRegister(engine *gin.Engine, body map[string]any) *httptest.ResponseRecorder {
	return doJSON(engine, http.MethodPost, "/api/v1/auth/register", body, false)
}

func TestRegister_Success(t *testing.T) {
	engine := newEngine(&fakeService{token: "signed-jwt"})

	rec := doRegister(engine, map[string]any{
		"fullName": "Ivan Petrov",
		"email":    "ivan@example.com",
		"password": "supersecret",
	})

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d: %s", http.StatusCreated, rec.Code, rec.Body.String())
	}

	var resp struct {
		Token string `json:"token"`
		User  struct {
			FullName string `json:"fullName"`
			Email    string `json:"email"`
		} `json:"user"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	if resp.Token != "signed-jwt" || resp.User.Email != "ivan@example.com" {
		t.Fatalf("unexpected response: %+v", resp)
	}
}

func TestRegister_InvalidBody(t *testing.T) {
	engine := newEngine(&fakeService{})

	rec := doRegister(engine, map[string]any{
		"email":    "ivan@example.com",
		"password": "supersecret",
	})

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected status %d, got %d", http.StatusUnprocessableEntity, rec.Code)
	}
}

func TestRegister_EmailAlreadyExists(t *testing.T) {
	engine := newEngine(&fakeService{err: entity.ErrUserAlreadyExists})

	rec := doRegister(engine, map[string]any{
		"fullName": "Ivan Petrov",
		"email":    "ivan@example.com",
		"password": "supersecret",
	})

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected status %d, got %d", http.StatusConflict, rec.Code)
	}
}
