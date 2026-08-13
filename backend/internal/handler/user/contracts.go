package user

import (
	"context"

	"github.com/google/uuid"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

type Service interface {
	Register(ctx context.Context, fullName, email, password string) (*entity.User, string, error)
	Login(ctx context.Context, email, password string) (*entity.User, string, error)
	Me(ctx context.Context, userID uuid.UUID) (*entity.User, error)
	ChangePassword(ctx context.Context, userID uuid.UUID, currentPassword, newPassword string) error

	SendRecoveryCode(ctx context.Context, email string) error
	VerifyRecoveryCode(ctx context.Context, email, code string) error
	ResetPassword(ctx context.Context, email, code, newPassword string) error
}
