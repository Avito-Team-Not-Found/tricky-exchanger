package user

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository"
)

// Repository — postgres-реализация доступа к таблице users.
type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// Create сохраняет нового пользователя. При дублировании email возвращает repository.ErrDuplicateKey.
func (r *Repository) Create(ctx context.Context, user *entity.User) error {
	const q = `
		INSERT INTO users (id, full_name, email, password_hash, created_at)
		VALUES ($1, $2, $3, $4, $5)
	`

	_, err := r.pool.Exec(ctx, q, user.ID, user.FullName, user.Email, user.PasswordHash, user.CreatedAt)
	if err != nil {
		return repository.MapDBError(err)
	}

	return nil
}

// GetByEmail возвращает пользователя по email. Если пользователь не найден — repository.ErrNotFound.
func (r *Repository) GetByEmail(ctx context.Context, email string) (*entity.User, error) {
	const q = `
		SELECT id, full_name, email, password_hash, created_at
		FROM users
		WHERE email = $1
	`

	var u entity.User
	err := r.pool.QueryRow(ctx, q, email).Scan(&u.ID, &u.FullName, &u.Email, &u.PasswordHash, &u.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, repository.ErrNotFound
		}
		return nil, repository.MapDBError(err)
	}

	return &u, nil
}
