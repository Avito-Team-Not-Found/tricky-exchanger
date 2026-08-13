package user

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/entity"
	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) Create(ctx context.Context, user *entity.User) error {
	const q = `
		INSERT INTO users (id, full_name, email, password_hash, created_at)
		VALUES ($1, $2, $3, $4, $5)
	`

	_, err := r.pool.Exec(ctx, q, user.ID, user.FullName, user.Email, user.PasswordHash, user.CreatedAt)
	if err != nil {
		if mappedErr, ok := repository.DBErrToErr(err); ok {
			return mappedErr
		}
		return err
	}

	return nil
}

func (r *Repository) GetByEmail(ctx context.Context, email string) (*entity.User, error) {
	const q = `
		SELECT id, full_name, email, password_hash, created_at
		FROM users
		WHERE email = $1
	`

	var u entity.User
	err := r.pool.QueryRow(ctx, q, email).Scan(&u.ID, &u.FullName, &u.Email, &u.PasswordHash, &u.CreatedAt)
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			if mappedErr, ok := repository.DBErrToErr(err); ok {
				return nil, mappedErr
			}
			return nil, err
		}
		return nil, repository.ErrNotFound
	}

	return &u, nil
}

func (r *Repository) GetByID(ctx context.Context, id uuid.UUID) (*entity.User, error) {
	const q = `
		SELECT id, full_name, email, password_hash, created_at
		FROM users
		WHERE id = $1
	`

	var u entity.User
	err := r.pool.QueryRow(ctx, q, id).Scan(&u.ID, &u.FullName, &u.Email, &u.PasswordHash, &u.CreatedAt)
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			if mappedErr, ok := repository.DBErrToErr(err); ok {
				return nil, mappedErr
			}
			return nil, err
		}
		return nil, repository.ErrNotFound
	}

	return &u, nil
}

func (r *Repository) UpdatePassword(ctx context.Context, id uuid.UUID, passwordHash string) error {
	const q = `
		UPDATE users
		SET password_hash = $2
		WHERE id = $1
	`

	tag, err := r.pool.Exec(ctx, q, id, passwordHash)
	if err != nil {
		if mappedErr, ok := repository.DBErrToErr(err); ok {
			return mappedErr
		}
		return err
	}
	if tag.RowsAffected() == 0 {
		return repository.ErrNotFound
	}

	return nil
}
