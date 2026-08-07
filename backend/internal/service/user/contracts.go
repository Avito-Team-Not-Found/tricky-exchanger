package user

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

// Repository — то, что service/user ожидает от слоя хранения.
// Реализация лежит в internal/repository/user.
type Repository interface {
	Create(ctx context.Context, user *entity.User) error
	GetByEmail(ctx context.Context, email string) (*entity.User, error)
	GetByID(ctx context.Context, id uuid.UUID) (*entity.User, error)
	UpdatePassword(ctx context.Context, id uuid.UUID, passwordHash string) error
}

// TokenIssuer — то, что service/user ожидает от инфраструктуры выпуска сессионных токенов.
// Реализация лежит в internal/infrastructure/token.
type TokenIssuer interface {
	Generate(userID uuid.UUID) (string, error)
}

// CodeStore — то, что service/user ожидает от хранилища кодов восстановления пароля.
// Реализация лежит в internal/infrastructure/codestore.
type CodeStore interface {
	Save(key, value string, ttl time.Duration)
	Get(key string) (string, bool)
	Delete(key string)
}

// Mailer — то, что service/user ожидает от инфраструктуры отправки почты.
// Реализация лежит в internal/infrastructure/mailer.
type Mailer interface {
	SendRecoveryCode(to, code string) error
}
