package user

import (
	"context"

	"github.com/google/uuid"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

// Service — то, что handler/user ожидает от слоя бизнес-логики.
// Реализация лежит в internal/service/user.
type Service interface {
	Register(ctx context.Context, fullName, email, password string) (*entity.User, string, error)
	Login(ctx context.Context, email, password string) (*entity.User, string, error)
	Me(ctx context.Context, userID uuid.UUID) (*entity.User, error)
	ChangePassword(ctx context.Context, userID uuid.UUID, currentPassword, newPassword string) error
}
