// Package repository содержит общие для всех репозиториев ошибки и утилиты
// маппинга ошибок PostgreSQL (pgx) в предсказуемые для service-слоя значения.
package repository

import (
	"errors"

	"github.com/jackc/pgx/v5/pgconn"
)

var (
	ErrNotFound     = errors.New("not found")
	ErrDuplicateKey = errors.New("duplicate key")
)

// pgUniqueViolation — код ошибки PostgreSQL для нарушения UNIQUE-constraint.
// https://www.postgresql.org/docs/current/errcodes-appendix.html
const pgUniqueViolation = "23505"

// MapDBError превращает специфичные для pgx ошибки в общие ошибки пакета repository,
// понятные вышестоящим слоям без знания деталей PostgreSQL.
func MapDBError(err error) error {
	if err == nil {
		return nil
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == pgUniqueViolation {
		return ErrDuplicateKey
	}

	return err
}
