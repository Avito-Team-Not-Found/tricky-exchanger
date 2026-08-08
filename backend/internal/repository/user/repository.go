package user

import (
	"context"

	"github.com/google/uuid"
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
		return repository.DBError(err)
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
		return nil, repository.DBError(err)
	}

	return &u, nil
}

// GetByID возвращает пользователя по ID. Если пользователь не найден — repository.ErrNotFound.
func (r *Repository) GetByID(ctx context.Context, id uuid.UUID) (*entity.User, error) {
	const q = `
		SELECT id, full_name, email, password_hash, created_at
		FROM users
		WHERE id = $1
	`

	var u entity.User
	err := r.pool.QueryRow(ctx, q, id).Scan(&u.ID, &u.FullName, &u.Email, &u.PasswordHash, &u.CreatedAt)
	if err != nil {
		return nil, repository.DBError(err)
	}

	return &u, nil
}

// UpdatePassword перезаписывает password_hash пользователя. Если пользователь
// не найден — repository.ErrNotFound.
func (r *Repository) UpdatePassword(ctx context.Context, id uuid.UUID, passwordHash string) error {
	const q = `
		UPDATE users
		SET password_hash = $2
		WHERE id = $1
	`

	tag, err := r.pool.Exec(ctx, q, id, passwordHash)
	if err != nil {
		return repository.DBError(err)
	}
	if tag.RowsAffected() == 0 {
		return repository.ErrNotFound
	}

	return nil
}
