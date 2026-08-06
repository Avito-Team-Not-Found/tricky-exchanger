package user_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository"
	userService "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/user"
)

type fakeRepo struct {
	createErr error
	created   *entity.User
}

func (f *fakeRepo) Create(_ context.Context, user *entity.User) error {
	if f.createErr != nil {
		return f.createErr
	}
	f.created = user
	return nil
}

func (f *fakeRepo) GetByEmail(_ context.Context, _ string) (*entity.User, error) {
	return nil, repository.ErrNotFound
}

type fakeTokens struct {
	token string
	err   error
}

func (f *fakeTokens) Generate(_ uuid.UUID) (string, error) {
	return f.token, f.err
}

func TestRegister_Success(t *testing.T) {
	repo := &fakeRepo{}
	tokens := &fakeTokens{token: "signed-jwt"}
	svc := userService.NewService(repo, tokens)

	user, token, err := svc.Register(context.Background(), "Ivan Petrov", "ivan@example.com", "supersecret")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if token != "signed-jwt" {
		t.Fatalf("expected issued token, got %q", token)
	}
	if user.Email != "ivan@example.com" || user.FullName != "Ivan Petrov" {
		t.Fatalf("unexpected user: %+v", user)
	}
	if user.PasswordHash == "" || user.PasswordHash == "supersecret" {
		t.Fatalf("password must be hashed, got %q", user.PasswordHash)
	}
	if repo.created == nil {
		t.Fatal("expected repo.Create to be called")
	}
}

func TestRegister_EmailAlreadyExists(t *testing.T) {
	repo := &fakeRepo{createErr: repository.ErrDuplicateKey}
	svc := userService.NewService(repo, &fakeTokens{token: "unused"})

	_, _, err := svc.Register(context.Background(), "Ivan", "dup@example.com", "supersecret")
	if !errors.Is(err, entity.ErrUserAlreadyExists) {
		t.Fatalf("expected ErrUserAlreadyExists, got %v", err)
	}
}
