package category_test

import (
	"context"
	"reflect"
	"testing"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	categoryService "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/category"
)

func TestListReturnsCategoriesFromRepository(t *testing.T) {
	repo := &fakeRepo{categories: []entity.Category{
		{ID: 1, Name: "Телефоны"},
		{ID: 2, Name: "Ноутбуки"},
		{ID: 3, Name: "Аудио и видео"},
	}}
	service := categoryService.NewService(repo)

	got, err := service.List(context.Background())
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if !reflect.DeepEqual(got, repo.categories) {
		t.Fatalf("List() = %#v, want %#v", got, repo.categories)
	}
	if !repo.called {
		t.Fatalf("expected repository.List to be called")
	}
}

func TestListReturnsEmptySliceWhenNoCategories(t *testing.T) {
	repo := &fakeRepo{categories: []entity.Category{}}
	service := categoryService.NewService(repo)

	got, err := service.List(context.Background())
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("List() = %#v, want empty", got)
	}
}

type fakeRepo struct {
	categories []entity.Category
	called     bool
}

func (r *fakeRepo) List(_ context.Context) ([]entity.Category, error) {
	r.called = true
	return r.categories, nil
}