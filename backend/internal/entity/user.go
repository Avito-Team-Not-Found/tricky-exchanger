package entity

import (
	"time"

	"github.com/google/uuid"
)

// User — сущность пользователя (см. PROJECT.md §7.2).
type User struct {
	ID        uuid.UUID `json:"id"`
	FullName  string    `json:"fullName"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"createdAt"`

	// PasswordHash никогда не должен попадать в JSON-ответы наружу.
	PasswordHash string `json:"-"`
}
