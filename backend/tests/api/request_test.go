package api_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/api"
)

func TestPathInt64(t *testing.T) {
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Params = gin.Params{{Key: "id", Value: "42"}}
	got, ok := api.PathInt64(c, "id")
	if !ok || got != 42 {
		t.Fatalf("got %d ok=%v", got, ok)
	}

	rec = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	c.Params = gin.Params{{Key: "id", Value: "0"}}
	if _, ok := api.PathInt64(c, "id"); ok || rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status=%d ok=%v", rec.Code, ok)
	}
}

func TestCurrentUserUUIDRequiresAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	if _, ok := api.CurrentUserUUID(c); ok || rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d", rec.Code)
	}

	id := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	rec = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(rec)
	c.Set(api.UserIDContextKey, id)
	got, ok := api.CurrentUserUUID(c)
	if !ok || got != id {
		t.Fatalf("got %v ok=%v", got, ok)
	}
	s, ok := api.CurrentUserString(c)
	if !ok || s != id.String() {
		t.Fatalf("string=%q", s)
	}
}

func TestBindJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)
	type body struct {
		Title string `json:"title" validate:"required"`
	}

	rec := httptest.NewRecorder()
	c, eng := gin.CreateTestContext(rec)
	_ = eng
	c.Request = httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{`))
	c.Request.Header.Set("Content-Type", "application/json")
	var dst body
	if api.BindJSON(c, &dst) || rec.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}

	rec = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"title":""}`))
	c.Request.Header.Set("Content-Type", "application/json")
	if api.BindJSON(c, &dst) || rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
}
