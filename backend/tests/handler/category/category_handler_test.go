package category_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	categoryhandler "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/handler/category"
)

func TestListReturnsCategories(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service := &handlerFakeService{categories: []entity.Category{
		{ID: 1, Name: "Телефоны"},
		{ID: 2, Name: "Ноутбуки"},
	}}
	handler := categoryhandler.NewHandler(service)

	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		c.Set("userID", uuid.New())
		c.Next()
	})
	engine.GET("/categories", handler.List)

	request := httptest.NewRequest(http.MethodGet, "/categories", nil)
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	const want = `[{"id":"1","name":"Телефоны"},{"id":"2","name":"Ноутбуки"}]`
	if got := recorder.Body.String(); got != want {
		t.Fatalf("body = %s, want %s", got, want)
	}
}

func TestListRequiresAuthenticatedUser(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := categoryhandler.NewHandler(&handlerFakeService{})

	engine := gin.New()
	engine.GET("/categories", handler.List)

	request := httptest.NewRequest(http.MethodGet, "/categories", nil)
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
	}
}

type handlerFakeService struct {
	categories []entity.Category
}

func (s *handlerFakeService) List(_ context.Context) ([]entity.Category, error) {
	return s.categories, nil
}