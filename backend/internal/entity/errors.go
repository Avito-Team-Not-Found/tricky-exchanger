package entity

import "errors"

// Бизнес-ошибки уровня domain/service. Транспортный слой (handler) сам решает,
// в какой HTTP-статус и код их превратить (см. internal/api).
var (
	ErrUserAlreadyExists   = errors.New("user with this email already exists")
	ErrUserNotFound        = errors.New("user not found")
	ErrInvalidCredentials  = errors.New("invalid email or password")
	ErrInvalidRecoveryCode = errors.New("invalid or expired recovery code")
)
