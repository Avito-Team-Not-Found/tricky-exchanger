package user_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	userHandler "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/handler/user"
)

type fakeService struct {
	user  *entity.User
	token string
	err   error
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

func newEngine(svc *fakeService) *gin.Engine {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	h := userHandler.NewHandler(svc)
	engine.POST("/api/v1/auth/register", h.Register)
	return engine
}

func doRegister(engine *gin.Engine, body map[string]any) *httptest.ResponseRecorder {
	payload, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	return rec
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

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, rec.Code)
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
