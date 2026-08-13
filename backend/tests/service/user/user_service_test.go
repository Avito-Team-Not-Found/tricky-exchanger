package user_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/pkg/codestore"

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

// fakeMailer — заглушка service-контракта Mailer, запоминает последний
// отправленный код (сервис генерирует его сам, тестам нужно его перехватить).
type fakeMailer struct {
	sendErr  error
	lastTo   string
	lastCode string
}

func (f *fakeMailer) SendRecoveryCode(to, code string) error {
	f.lastTo = to
	f.lastCode = code
	return f.sendErr
}

// newService собирает *userService.Service с настоящим (in-memory) CodeStore —
// его поведение простое и детерминированное, фейковать смысла нет.
func newService(repo userService.Repository, tokens userService.TokenIssuer, mailer userService.Mailer) *userService.Service {
	return userService.NewService(repo, tokens, codestore.New(), mailer, time.Hour)
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
	svc := newService(repo, tokens, &fakeMailer{})

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
	svc := newService(repo, &fakeTokens{token: "unused"}, &fakeMailer{})

	_, _, err := svc.Register(context.Background(), "Ivan", "dup@example.com", "supersecret")
	if !errors.Is(err, entity.ErrUserAlreadyExists) {
		t.Fatalf("expected ErrUserAlreadyExists, got %v", err)
	}
}

func TestLogin_Success(t *testing.T) {
	existing := &entity.User{ID: uuid.New(), Email: "ivan@example.com", PasswordHash: hashPassword(t, "supersecret")}
	repo := &fakeRepo{byEmail: existing}
	svc := newService(repo, &fakeTokens{token: "signed-jwt"}, &fakeMailer{})

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
	svc := newService(repo, &fakeTokens{token: "unused"}, &fakeMailer{})

	_, _, err := svc.Login(context.Background(), "unknown@example.com", "supersecret")
	if !errors.Is(err, entity.ErrInvalidCredentials) {
		t.Fatalf("expected ErrInvalidCredentials, got %v", err)
	}
}

func TestLogin_WrongPassword(t *testing.T) {
	existing := &entity.User{ID: uuid.New(), Email: "ivan@example.com", PasswordHash: hashPassword(t, "supersecret")}
	repo := &fakeRepo{byEmail: existing}
	svc := newService(repo, &fakeTokens{token: "unused"}, &fakeMailer{})

	_, _, err := svc.Login(context.Background(), "ivan@example.com", "wrong-password")
	if !errors.Is(err, entity.ErrInvalidCredentials) {
		t.Fatalf("expected ErrInvalidCredentials, got %v", err)
	}
}

func TestMe_Success(t *testing.T) {
	existing := &entity.User{ID: uuid.New(), Email: "ivan@example.com"}
	repo := &fakeRepo{byID: existing}
	svc := newService(repo, &fakeTokens{}, &fakeMailer{})

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
	svc := newService(repo, &fakeTokens{}, &fakeMailer{})

	_, err := svc.Me(context.Background(), uuid.New())
	if !errors.Is(err, entity.ErrUserNotFound) {
		t.Fatalf("expected ErrUserNotFound, got %v", err)
	}
}

func TestChangePassword_Success(t *testing.T) {
	userID := uuid.New()
	existing := &entity.User{ID: userID, PasswordHash: hashPassword(t, "oldpassword")}
	repo := &fakeRepo{byID: existing}
	svc := newService(repo, &fakeTokens{}, &fakeMailer{})

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
	svc := newService(repo, &fakeTokens{}, &fakeMailer{})

	err := svc.ChangePassword(context.Background(), userID, "wrong", "newpassword1")
	if !errors.Is(err, entity.ErrInvalidCredentials) {
		t.Fatalf("expected ErrInvalidCredentials, got %v", err)
	}
	if repo.updatedPasswordHash != "" {
		t.Fatal("repo.UpdatePassword must not be called on wrong current password")
	}
}

func TestSendRecoveryCode_Success(t *testing.T) {
	repo := &fakeRepo{byEmail: &entity.User{ID: uuid.New(), Email: "ivan@example.com"}}
	mailer := &fakeMailer{}
	svc := newService(repo, &fakeTokens{}, mailer)

	if err := svc.SendRecoveryCode(context.Background(), "ivan@example.com"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mailer.lastTo != "ivan@example.com" {
		t.Fatalf("expected mail sent to ivan@example.com, got %q", mailer.lastTo)
	}
	if len(mailer.lastCode) != 6 {
		t.Fatalf("expected 6-digit code, got %q", mailer.lastCode)
	}
}

func TestSendRecoveryCode_UnknownEmail(t *testing.T) {
	repo := &fakeRepo{}
	svc := newService(repo, &fakeTokens{}, &fakeMailer{})

	err := svc.SendRecoveryCode(context.Background(), "unknown@example.com")
	if !errors.Is(err, entity.ErrUserNotFound) {
		t.Fatalf("expected ErrUserNotFound, got %v", err)
	}
}

func TestSendRecoveryCode_MailerFailure(t *testing.T) {
	repo := &fakeRepo{byEmail: &entity.User{ID: uuid.New(), Email: "ivan@example.com"}}
	mailer := &fakeMailer{sendErr: errors.New("smtp is down")}
	svc := newService(repo, &fakeTokens{}, mailer)

	if err := svc.SendRecoveryCode(context.Background(), "ivan@example.com"); err == nil {
		t.Fatal("expected error when mailer fails")
	}
}

func TestVerifyRecoveryCode_Success(t *testing.T) {
	repo := &fakeRepo{byEmail: &entity.User{ID: uuid.New(), Email: "ivan@example.com"}}
	mailer := &fakeMailer{}
	svc := newService(repo, &fakeTokens{}, mailer)

	if err := svc.SendRecoveryCode(context.Background(), "ivan@example.com"); err != nil {
		t.Fatalf("unexpected error sending code: %v", err)
	}
	if err := svc.VerifyRecoveryCode(context.Background(), "ivan@example.com", mailer.lastCode); err != nil {
		t.Fatalf("unexpected error verifying code: %v", err)
	}
}

func TestVerifyRecoveryCode_WrongCode(t *testing.T) {
	repo := &fakeRepo{byEmail: &entity.User{ID: uuid.New(), Email: "ivan@example.com"}}
	mailer := &fakeMailer{}
	svc := newService(repo, &fakeTokens{}, mailer)

	if err := svc.SendRecoveryCode(context.Background(), "ivan@example.com"); err != nil {
		t.Fatalf("unexpected error sending code: %v", err)
	}

	err := svc.VerifyRecoveryCode(context.Background(), "ivan@example.com", "000000")
	if !errors.Is(err, entity.ErrInvalidRecoveryCode) {
		t.Fatalf("expected ErrInvalidRecoveryCode, got %v", err)
	}
}

func TestVerifyRecoveryCode_NoCodeRequested(t *testing.T) {
	svc := newService(&fakeRepo{}, &fakeTokens{}, &fakeMailer{})

	err := svc.VerifyRecoveryCode(context.Background(), "ivan@example.com", "123456")
	if !errors.Is(err, entity.ErrInvalidRecoveryCode) {
		t.Fatalf("expected ErrInvalidRecoveryCode, got %v", err)
	}
}

func TestResetPassword_Success(t *testing.T) {
	userID := uuid.New()
	repo := &fakeRepo{byEmail: &entity.User{ID: userID, Email: "ivan@example.com", PasswordHash: hashPassword(t, "oldpassword")}}
	mailer := &fakeMailer{}
	svc := newService(repo, &fakeTokens{}, mailer)

	if err := svc.SendRecoveryCode(context.Background(), "ivan@example.com"); err != nil {
		t.Fatalf("unexpected error sending code: %v", err)
	}

	err := svc.ResetPassword(context.Background(), "ivan@example.com", mailer.lastCode, "newpassword1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.updatedPasswordHash == "" {
		t.Fatal("expected repo.UpdatePassword to be called")
	}
	if bcrypt.CompareHashAndPassword([]byte(repo.updatedPasswordHash), []byte("newpassword1")) != nil {
		t.Fatal("stored hash does not match new password")
	}

	// код одноразовый — повторное использование должно быть отклонено
	err = svc.ResetPassword(context.Background(), "ivan@example.com", mailer.lastCode, "anotherpassword1")
	if !errors.Is(err, entity.ErrInvalidRecoveryCode) {
		t.Fatalf("expected ErrInvalidRecoveryCode on code reuse, got %v", err)
	}
}

func TestResetPassword_WrongCode(t *testing.T) {
	repo := &fakeRepo{byEmail: &entity.User{ID: uuid.New(), Email: "ivan@example.com", PasswordHash: hashPassword(t, "oldpassword")}}
	mailer := &fakeMailer{}
	svc := newService(repo, &fakeTokens{}, mailer)

	if err := svc.SendRecoveryCode(context.Background(), "ivan@example.com"); err != nil {
		t.Fatalf("unexpected error sending code: %v", err)
	}

	err := svc.ResetPassword(context.Background(), "ivan@example.com", "000000", "newpassword1")
	if !errors.Is(err, entity.ErrInvalidRecoveryCode) {
		t.Fatalf("expected ErrInvalidRecoveryCode, got %v", err)
	}
	if repo.updatedPasswordHash != "" {
		t.Fatal("repo.UpdatePassword must not be called on wrong code")
	}
}

func TestResetPassword_NotConsumedByVerifyOnly(t *testing.T) {
	userID := uuid.New()
	repo := &fakeRepo{byEmail: &entity.User{ID: userID, Email: "ivan@example.com", PasswordHash: hashPassword(t, "oldpassword")}}
	mailer := &fakeMailer{}
	svc := newService(repo, &fakeTokens{}, mailer)

	if err := svc.SendRecoveryCode(context.Background(), "ivan@example.com"); err != nil {
		t.Fatalf("unexpected error sending code: %v", err)
	}
	if err := svc.VerifyRecoveryCode(context.Background(), "ivan@example.com", mailer.lastCode); err != nil {
		t.Fatalf("unexpected error verifying code: %v", err)
	}

	// VerifyRecoveryCode не должен гасить код — ResetPassword всё ещё должен пройти
	if err := svc.ResetPassword(context.Background(), "ivan@example.com", mailer.lastCode, "newpassword1"); err != nil {
		t.Fatalf("unexpected error resetting password after verify: %v", err)
	}
}
