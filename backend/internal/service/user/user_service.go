package user

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository"
)

type Service struct {
	repo   Repository
	tokens TokenIssuer
}

func NewService(repo Repository, tokens TokenIssuer) *Service {
	return &Service{repo: repo, tokens: tokens}
}

// Register создаёт нового пользователя и сразу выпускает для него сессионный токен
// (PROJECT.md §4.1: регистрация одновременно создаёт сессию).
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
