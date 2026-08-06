package user

import (
	"context"

	"github.com/google/uuid"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

// Repository — то, что service/user ожидает от слоя хранения.
// Реализация лежит в internal/repository/user.
type Repository interface {
	Create(ctx context.Context, user *entity.User) error
	GetByEmail(ctx context.Context, email string) (*entity.User, error)
}

// TokenIssuer — то, что service/user ожидает от инфраструктуры выпуска сессионных токенов.
// Реализация лежит в internal/infrastructure/token.
type TokenIssuer interface {
	Generate(userID uuid.UUID) (string, error)
}
