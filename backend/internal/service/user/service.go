package user

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository"
)

type Service struct {
	repo            Repository
	tokens          TokenIssuer
	codes           CodeStore
	mailer          Mailer
	recoveryCodeTTL time.Duration
}

func NewService(repo Repository, tokens TokenIssuer, codes CodeStore, mailer Mailer, recoveryCodeTTL time.Duration) *Service {
	return &Service{repo: repo, tokens: tokens, codes: codes, mailer: mailer, recoveryCodeTTL: recoveryCodeTTL}
}

func (s *Service) Register(ctx context.Context, fullName, email, password string) (*entity.User, string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, "", fmt.Errorf("hash password: %w", err)
	}

	user := &entity.User{
		ID:           uuid.New(),
		FullName:     fullName,
		Email:        email,
		PasswordHash: string(hash),
		CreatedAt:    time.Now().UTC(),
	}

	if err := s.repo.Create(ctx, user); err != nil {
		if errors.Is(err, repository.ErrDuplicateKey) {
			return nil, "", entity.ErrUserAlreadyExists
		}
		return nil, "", fmt.Errorf("create user: %w", err)
	}

	token, err := s.tokens.Generate(user.ID)
	if err != nil {
		return nil, "", fmt.Errorf("generate token: %w", err)
	}

	return user, token, nil
}

// Login: ErrInvalidCredentials и при отсутствии email, и при неверном пароле
// (не раскрываем, зарегистрирован ли email).
func (s *Service) Login(ctx context.Context, email, password string) (*entity.User, string, error) {
	user, err := s.repo.GetByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, "", entity.ErrInvalidCredentials
		}
		return nil, "", fmt.Errorf("get user by email: %w", err)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, "", entity.ErrInvalidCredentials
	}

	token, err := s.tokens.Generate(user.ID)
	if err != nil {
		return nil, "", fmt.Errorf("generate token: %w", err)
	}

	return user, token, nil
}

func (s *Service) Me(ctx context.Context, userID uuid.UUID) (*entity.User, error) {
	user, err := s.repo.GetByID(ctx, userID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, entity.ErrUserNotFound
		}
		return nil, fmt.Errorf("get user by id: %w", err)
	}

	return user, nil
}

func (s *Service) ChangePassword(ctx context.Context, userID uuid.UUID, currentPassword, newPassword string) error {
	user, err := s.repo.GetByID(ctx, userID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return entity.ErrUserNotFound
		}
		return fmt.Errorf("get user by id: %w", err)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(currentPassword)); err != nil {
		return entity.ErrInvalidCredentials
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	if err := s.repo.UpdatePassword(ctx, userID, string(hash)); err != nil {
		return fmt.Errorf("update password: %w", err)
	}

	return nil
}

// SendRecoveryCode — код в CodeStore (хэш) + письмо; ErrUserNotFound если email неизвестен.
func (s *Service) SendRecoveryCode(ctx context.Context, email string) error {
	if _, err := s.repo.GetByEmail(ctx, email); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return entity.ErrUserNotFound
		}
		return fmt.Errorf("get user by email: %w", err)
	}

	code, err := generateRecoveryCode()
	if err != nil {
		return fmt.Errorf("generate recovery code: %w", err)
	}

	s.codes.Save(recoveryCodeKey(email), hashRecoveryCode(code), s.recoveryCodeTTL)

	if err := s.mailer.SendRecoveryCode(email, code); err != nil {
		return fmt.Errorf("send recovery code: %w", err)
	}

	return nil
}

// VerifyRecoveryCode — проверка без расхода кода (UX для фронта); расход в ResetPassword.
func (s *Service) VerifyRecoveryCode(_ context.Context, email, code string) error {
	stored, ok := s.codes.Get(recoveryCodeKey(email))
	if !ok || stored != hashRecoveryCode(code) {
		return entity.ErrInvalidRecoveryCode
	}

	return nil
}

// ResetPassword — повторно проверяет код, меняет пароль и гасит код (одноразовость).
func (s *Service) ResetPassword(ctx context.Context, email, code, newPassword string) error {
	key := recoveryCodeKey(email)

	stored, ok := s.codes.Get(key)
	if !ok || stored != hashRecoveryCode(code) {
		return entity.ErrInvalidRecoveryCode
	}

	user, err := s.repo.GetByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return entity.ErrUserNotFound
		}
		return fmt.Errorf("get user by email: %w", err)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	if err := s.repo.UpdatePassword(ctx, user.ID, string(hash)); err != nil {
		return fmt.Errorf("update password: %w", err)
	}

	s.codes.Delete(key)

	return nil
}

func recoveryCodeKey(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// generateRecoveryCode — crypto/rand, 6 цифр с ведущими нулями.
func generateRecoveryCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

// hashRecoveryCode — в CodeStore кладём хэш, не plaintext.
func hashRecoveryCode(code string) string {
	sum := sha256.Sum256([]byte(code))
	return hex.EncodeToString(sum[:])
}
