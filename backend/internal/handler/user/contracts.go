package user

import (
	"context"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
)

// Service — то, что handler/user ожидает от слоя бизнес-логики.
// Реализация лежит в internal/service/user.
type Service interface {
	Register(ctx context.Context, fullName, email, password string) (*entity.User, string, error)
}
