// Package repository содержит общие для всех репозиториев ошибки и утилиты
// маппинга ошибок PostgreSQL (pgx) в предсказуемые для service-слоя значения.
package repository

import (
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/sirupsen/logrus"
)

// Sentinel-ошибки слоя хранения. Service-слой мапит их в entity.* без знания SQLSTATE.
var (
	ErrDBCheckNilConn     = errors.New("db connection nil")
	ErrTableDoesNotExist  = errors.New("table does not exist")
	ErrUpdateFailed       = errors.New("update failed")
	ErrInsertFailed       = errors.New("insert failed")
	ErrGetFailed          = errors.New("get failed")
	ErrFindFailed         = errors.New("find failed")
	ErrNotFound           = errors.New("not found")
	ErrNoRecords          = errors.New("no records found")
	ErrDuplicateKey       = errors.New("duplicate key")
	ErrForeignKeyViolated = errors.New("foreign key violated")
	ErrConflict           = errors.New("conflict")
	ErrNotNullViolation   = errors.New("not null violated")
	ErrCheckViolation     = errors.New("check constraint violated")
)

// Коды берите отсюда, если будете еще логировать ошибки
// PostgreSQL: https://www.postgresql.org/docs/current/errcodes-appendix.html
const (
	pgUndefinedTable      = "42P01"
	pgNotNullViolation    = "23502"
	pgForeignKeyViolation = "23503"
	pgUniqueViolation     = "23505"
	pgCheckViolation      = "23514"
	pgExclusionViolation  = "23P01"
	pgSerializationFail   = "40001"
	pgDeadlockDetected    = "40P01"
)

// DBError мапит ошибку pgx/PostgreSQL в sentinel пакета repository и логирует
// SQLSTATE, сообщение, detail, таблицу и constraint. Возвращаемую ошибку можно
// проверять через errors.Is (обёртка сохраняет sentinel через %w).
func DBError(err error) error {
	if err == nil {
		return nil
	}

	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}

	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		logrus.WithError(err).Error("database error")
		return err
	}

	fields := logrus.Fields{
		"pg_code":       pgErr.Code,
		"pg_severity":   pgErr.Severity,
		"pg_message":    pgErr.Message,
		"pg_detail":     pgErr.Detail,
		"pg_hint":       pgErr.Hint,
		"pg_schema":     pgErr.SchemaName,
		"pg_table":      pgErr.TableName,
		"pg_column":     pgErr.ColumnName,
		"pg_constraint": pgErr.ConstraintName,
	}

	mapped, ok := mapPgError(pgErr)
	entry := logrus.WithFields(fields).WithError(err)
	if ok {
		entry.Warn("database error")
		return mapped
	}

	entry.Error("unhandled database error")
	return fmt.Errorf("database error [%s]: %w", pgErr.Code, err)
}

// mapPgError переводит известные SQLSTATE в sentinel с деталями Postgres.
func mapPgError(pgErr *pgconn.PgError) (error, bool) {
	detail := pgErr.Detail
	if detail == "" {
		detail = "-"
	}

	switch pgErr.Code {
	case pgUndefinedTable:
		return fmt.Errorf("%w: %s: %s", ErrTableDoesNotExist, pgErr.Message, detail), true
	case pgForeignKeyViolation:
		return fmt.Errorf("%w: %s: %s", ErrForeignKeyViolated, pgErr.Message, detail), true
	case pgUniqueViolation:
		return fmt.Errorf("%w: %s: %s", ErrDuplicateKey, pgErr.Message, detail), true
	case pgNotNullViolation:
		return fmt.Errorf("%w: %s: %s", ErrNotNullViolation, pgErr.Message, detail), true
	case pgCheckViolation:
		return fmt.Errorf("%w: %s: %s", ErrCheckViolation, pgErr.Message, detail), true
	case pgExclusionViolation, pgSerializationFail, pgDeadlockDetected:
		return fmt.Errorf("%w: %s: %s", ErrConflict, pgErr.Message, detail), true
	default:
		return nil, false
	}
}
