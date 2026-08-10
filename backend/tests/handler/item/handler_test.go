package item_test

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	itemhandler "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/handler/item"
	itemservice "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/item"
)

func TestListUsesAuthenticatedUserFromContext(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ownerID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	service := &handlerFakeService{
		list: []*entity.Item{{
			ID:          1,
			OwnerUserID: ownerID,
			Title:       "PlayStation 5",
			Status:      entity.ItemStatusActive,
			CreatedAt:   time.Date(2026, 8, 7, 9, 0, 0, 0, time.UTC),
			UpdatedAt:   time.Date(2026, 8, 7, 9, 0, 0, 0, time.UTC),
		}},
		total: 1,
	}
	handler := itemhandler.NewHandler(service)

	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		c.Set("userID", ownerID)
		c.Next()
	})
	routes := engine.Group("/items")
	routes.GET("", handler.List)

	request := httptest.NewRequest(http.MethodGet, "/items", nil)
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	if service.listOwnerID != ownerID {
		t.Fatalf("list owner ID = %s, want %s", service.listOwnerID, ownerID)
	}
	const want = `{"items":[{"id":1,"ownerUserId":"11111111-1111-1111-1111-111111111111","title":"PlayStation 5","description":"","category":"","imageUrl":null,"status":"ACTIVE","createdAt":"2026-08-07T09:00:00Z","updatedAt":"2026-08-07T09:00:00Z"}],"page":1,"pageSize":20,"total":1}`
	if got := recorder.Body.String(); got != want {
		t.Fatalf("body = %s, want %s", got, want)
	}
}

func TestListRequiresAuthenticatedUser(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := itemhandler.NewHandler(&handlerFakeService{})
	engine := gin.New()
	routes := engine.Group("/items")
	routes.GET("", handler.List)

	request := httptest.NewRequest(http.MethodGet, "/items", nil)
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
	}
}

func TestCreateRequiresCategory(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := itemhandler.NewHandler(&handlerFakeService{})
	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		c.Set("userID", uuid.New())
		c.Next()
	})
	engine.POST("/items", handler.Create)

	request := httptest.NewRequest(
		http.MethodPost,
		"/items",
		strings.NewReader(`{"title":"PlayStation 5","description":"console"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusUnprocessableEntity, recorder.Body.String())
	}
}

func TestGetMapsForbiddenAndNotFoundTo404(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := itemhandler.NewHandler(&handlerFakeService{getErr: entity.ErrItemForbidden})
	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		c.Set("userID", uuid.New())
		c.Next()
	})
	routes := engine.Group("/items")
	routes.GET("/:id", handler.Get)

	request := httptest.NewRequest(http.MethodGet, "/items/1", nil)
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusNotFound, recorder.Body.String())
	}
}

func TestArchiveReturnsNoContent(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service := &handlerFakeService{}
	handler := itemhandler.NewHandler(service)
	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		c.Set("userID", uuid.New())
		c.Next()
	})
	routes := engine.Group("/items")
	routes.DELETE("/:id", handler.Archive)

	request := httptest.NewRequest(http.MethodDelete, "/items/1", nil)
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusNoContent, recorder.Body.String())
	}
	if service.archivedID != 1 {
		t.Fatalf("archived item id = %d, want 1", service.archivedID)
	}
}

type handlerFakeService struct {
	list        []*entity.Item
	total       int
	listOwnerID uuid.UUID
	getErr      error
	archivedID  int64
}

func (s *handlerFakeService) Create(_ context.Context, _ uuid.UUID, _ itemservice.CreateInput) (*entity.Item, error) {
	return &entity.Item{}, nil
}

func (s *handlerFakeService) Get(_ context.Context, _ uuid.UUID, _ int64) (*entity.Item, error) {
	if s.getErr != nil {
		return nil, s.getErr
	}
	return &entity.Item{}, nil
}

func (s *handlerFakeService) List(_ context.Context, ownerID uuid.UUID, _, _ int) ([]*entity.Item, int, error) {
	s.listOwnerID = ownerID
	return s.list, s.total, nil
}

func (s *handlerFakeService) Update(_ context.Context, _ uuid.UUID, _ int64, _ itemservice.UpdateInput) (*entity.Item, error) {
	return &entity.Item{}, nil
}

func (s *handlerFakeService) Archive(_ context.Context, _ uuid.UUID, itemID int64) error {
	s.archivedID = itemID
	return nil
}

func (s *handlerFakeService) UploadImage(_ context.Context, _ uuid.UUID, _ int64, _ io.Reader, _ int64, _ string) (*entity.Item, error) {
	return &entity.Item{}, nil
}
