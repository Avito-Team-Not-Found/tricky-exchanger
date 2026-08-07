package user_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository"
	userService "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/service/user"
)

// fakeRepo — заглушка service-контракта Repository. Тесты заполняют только
// поля, релевантные проверяемому сценарию.
type fakeRepo struct {
	createErr error
	created   *entity.User

	byEmail    *entity.User
	byEmailErr error

	byID    *entity.User
	byIDErr error

	updatePasswordErr   error
	updatedPasswordHash string
}

func (f *fakeRepo) Create(_ context.Context, user *entity.User) error {
	if f.createErr != nil {
		return f.createErr
	}
	f.created = user
	return nil
}

func (f *fakeRepo) GetByEmail(_ context.Context, _ string) (*entity.User, error) {
	if f.byEmailErr != nil {
		return nil, f.byEmailErr
	}
	if f.byEmail == nil {
		return nil, repository.ErrNotFound
	}
	return f.byEmail, nil
}

func (f *fakeRepo) GetByID(_ context.Context, _ uuid.UUID) (*entity.User, error) {
	if f.byIDErr != nil {
		return nil, f.byIDErr
	}
	if f.byID == nil {
		return nil, repository.ErrNotFound
	}
	return f.byID, nil
}

func (f *fakeRepo) UpdatePassword(_ context.Context, _ uuid.UUID, passwordHash string) error {
	if f.updatePasswordErr != nil {
		return f.updatePasswordErr
	}
	f.updatedPasswordHash = passwordHash
	return nil
}

type fakeTokens struct {
	token string
	err   error
}

func (f *fakeTokens) Generate(_ uuid.UUID) (string, error) {
	return f.token, f.err
}

func hashPassword(t *testing.T, password string) string {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	return string(hash)
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

func TestLogin_Success(t *testing.T) {
	existing := &entity.User{ID: uuid.New(), Email: "ivan@example.com", PasswordHash: hashPassword(t, "supersecret")}
	repo := &fakeRepo{byEmail: existing}
	svc := userService.NewService(repo, &fakeTokens{token: "signed-jwt"})

	user, token, err := svc.Login(context.Background(), "ivan@example.com", "supersecret")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if token != "signed-jwt" || user.ID != existing.ID {
		t.Fatalf("unexpected result: user=%+v token=%q", user, token)
	}
}

func TestLogin_UnknownEmail(t *testing.T) {
	repo := &fakeRepo{}
	svc := userService.NewService(repo, &fakeTokens{token: "unused"})

	_, _, err := svc.Login(context.Background(), "unknown@example.com", "supersecret")
	if !errors.Is(err, entity.ErrInvalidCredentials) {
		t.Fatalf("expected ErrInvalidCredentials, got %v", err)
	}
}

func TestLogin_WrongPassword(t *testing.T) {
	existing := &entity.User{ID: uuid.New(), Email: "ivan@example.com", PasswordHash: hashPassword(t, "supersecret")}
	repo := &fakeRepo{byEmail: existing}
	svc := userService.NewService(repo, &fakeTokens{token: "unused"})

	_, _, err := svc.Login(context.Background(), "ivan@example.com", "wrong-password")
	if !errors.Is(err, entity.ErrInvalidCredentials) {
		t.Fatalf("expected ErrInvalidCredentials, got %v", err)
	}
}

func TestMe_Success(t *testing.T) {
	existing := &entity.User{ID: uuid.New(), Email: "ivan@example.com"}
	repo := &fakeRepo{byID: existing}
	svc := userService.NewService(repo, &fakeTokens{})

	user, err := svc.Me(context.Background(), existing.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if user.ID != existing.ID {
		t.Fatalf("unexpected user: %+v", user)
	}
}

func TestMe_NotFound(t *testing.T) {
	repo := &fakeRepo{}
	svc := userService.NewService(repo, &fakeTokens{})

	_, err := svc.Me(context.Background(), uuid.New())
	if !errors.Is(err, entity.ErrUserNotFound) {
		t.Fatalf("expected ErrUserNotFound, got %v", err)
	}
}

func TestChangePassword_Success(t *testing.T) {
	userID := uuid.New()
	existing := &entity.User{ID: userID, PasswordHash: hashPassword(t, "oldpassword")}
	repo := &fakeRepo{byID: existing}
	svc := userService.NewService(repo, &fakeTokens{})

	err := svc.ChangePassword(context.Background(), userID, "oldpassword", "newpassword1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.updatedPasswordHash == "" {
		t.Fatal("expected repo.UpdatePassword to be called")
	}
	if bcrypt.CompareHashAndPassword([]byte(repo.updatedPasswordHash), []byte("newpassword1")) != nil {
		t.Fatal("stored hash does not match new password")
	}
}

func TestChangePassword_WrongCurrentPassword(t *testing.T) {
	userID := uuid.New()
	existing := &entity.User{ID: userID, PasswordHash: hashPassword(t, "oldpassword")}
	repo := &fakeRepo{byID: existing}
	svc := userService.NewService(repo, &fakeTokens{})

	err := svc.ChangePassword(context.Background(), userID, "wrong", "newpassword1")
	if !errors.Is(err, entity.ErrInvalidCredentials) {
		t.Fatalf("expected ErrInvalidCredentials, got %v", err)
	}
	if repo.updatedPasswordHash != "" {
		t.Fatal("repo.UpdatePassword must not be called on wrong current password")
	}
}
