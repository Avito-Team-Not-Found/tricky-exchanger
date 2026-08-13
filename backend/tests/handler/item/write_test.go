package item_test

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	itemhandler "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/handler/item"
	itemservice "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/item"
)

func TestCreateReturnsCreatedItem(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service := &writeFakeService{created: &entity.Item{ID: 11, Title: "Ручка", Category: "office"}}
	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		c.Set("userID", uuid.New())
		c.Next()
	})
	engine.POST("/items", itemhandler.NewHandler(service).Create)

	req := httptest.NewRequest(
		http.MethodPost,
		"/items",
		strings.NewReader(`{"title":"Ручка","description":"синяя","category":"office"}`),
	)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"id":11`) {
		t.Fatalf("body = %s", rec.Body.String())
	}
	if service.createInput.Title != "Ручка" || service.createInput.Category != "office" {
		t.Fatalf("create input = %+v", service.createInput)
	}
}

func TestCreateRejectsEmptyTitle(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		c.Set("userID", uuid.New())
		c.Next()
	})
	engine.POST("/items", itemhandler.NewHandler(&writeFakeService{}).Create)

	req := httptest.NewRequest(http.MethodPost, "/items", strings.NewReader(`{"title":"","category":"office"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
}

func TestUpdateMapsHardReservationConflict(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service := &writeFakeService{updateErr: entity.ErrItemHasHardReservation}
	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		c.Set("userID", uuid.New())
		c.Next()
	})
	engine.PATCH("/items/:id", itemhandler.NewHandler(service).Update)

	req := httptest.NewRequest(http.MethodPatch, "/items/3", strings.NewReader(`{"title":"x"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
}

type writeFakeService struct {
	created     *entity.Item
	createInput itemservice.CreateInput
	updateErr   error
}

func (s *writeFakeService) Create(_ context.Context, _ uuid.UUID, in itemservice.CreateInput) (*entity.Item, error) {
	s.createInput = in
	if s.created != nil {
		return s.created, nil
	}
	return &entity.Item{}, nil
}

func (s *writeFakeService) Get(context.Context, uuid.UUID, int64) (*entity.Item, error) {
	return &entity.Item{}, nil
}

func (s *writeFakeService) List(context.Context, uuid.UUID, int, int) ([]*entity.Item, int, error) {
	return nil, 0, nil
}

func (s *writeFakeService) Update(context.Context, uuid.UUID, int64, itemservice.UpdateInput) (*entity.Item, error) {
	return nil, s.updateErr
}

func (s *writeFakeService) Archive(context.Context, uuid.UUID, int64) error { return nil }

func (s *writeFakeService) UploadImage(context.Context, uuid.UUID, int64, io.Reader, int64, string) (*entity.Item, error) {
	return &entity.Item{}, nil
}
