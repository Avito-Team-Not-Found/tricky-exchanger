// Package token отвечает за выпуск и разбор JWT сессионных токенов.
// Это техническая (infrastructure) обвязка вокруг golang-jwt, без бизнес-логики.
package token

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

var ErrInvalidToken = errors.New("invalid or expired token")

// Service выпускает и проверяет JWT с алгоритмом HS256.
type Service struct {
	secret []byte
	ttl    time.Duration
}

func NewService(secret string, ttl time.Duration) *Service {
	return &Service{secret: []byte(secret), ttl: ttl}
}

// Generate выпускает токен сессии для пользователя userID.
func (s *Service) Generate(userID uuid.UUID) (string, error) {
	now := time.Now()
	claims := jwt.MapClaims{
		"sub": userID.String(),
		"iat": now.Unix(),
		"exp": now.Add(s.ttl).Unix(),
	}

	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.secret)
}

// Parse проверяет подпись и срок действия токена, возвращает ID пользователя из claim'а sub.
func (s *Service) Parse(tokenStr string) (uuid.UUID, error) {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return s.secret, nil
	})
	if err != nil || !token.Valid {
		return uuid.Nil, ErrInvalidToken
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return uuid.Nil, ErrInvalidToken
	}

	sub, _ := claims["sub"].(string)
	userID, err := uuid.Parse(sub)
	if err != nil {
		return uuid.Nil, ErrInvalidToken
	}

	return userID, nil
}
