package repository_test

import (
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository"
)

func TestDBError_Nil(t *testing.T) {
	if err := repository.DBError(nil); err != nil {
		t.Fatalf("DBError(nil) = %v, want nil", err)
	}
}

func TestDBError_NoRows(t *testing.T) {
	err := repository.DBError(pgx.ErrNoRows)
	if !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("DBError(ErrNoRows) = %v, want ErrNotFound", err)
	}
}

func TestDBError_UniqueViolation(t *testing.T) {
	err := repository.DBError(&pgconn.PgError{
		Code:           "23505",
		Message:        "duplicate key value violates unique constraint",
		Detail:         "Key (email)=(a@b.c) already exists.",
		ConstraintName: "users_email_key",
		TableName:      "users",
	})
	if !errors.Is(err, repository.ErrDuplicateKey) {
		t.Fatalf("DBError(23505) = %v, want ErrDuplicateKey", err)
	}
}

func TestDBError_ForeignKey(t *testing.T) {
	err := repository.DBError(&pgconn.PgError{
		Code:    "23503",
		Message: "insert or update on table violates foreign key constraint",
		Detail:  "Key (offered_item_id)=(1) is not present in table \"items\".",
	})
	if !errors.Is(err, repository.ErrForeignKeyViolated) {
		t.Fatalf("DBError(23503) = %v, want ErrForeignKeyViolated", err)
	}
}

func TestDBError_UndefinedTable(t *testing.T) {
	err := repository.DBError(&pgconn.PgError{
		Code:    "42P01",
		Message: `relation "missing" does not exist`,
	})
	if !errors.Is(err, repository.ErrTableDoesNotExist) {
		t.Fatalf("DBError(42P01) = %v, want ErrTableDoesNotExist", err)
	}
}

func TestDBError_ConflictCodes(t *testing.T) {
	for _, code := range []string{"23P01", "40001", "40P01"} {
		err := repository.DBError(&pgconn.PgError{Code: code, Message: "conflict"})
		if !errors.Is(err, repository.ErrConflict) {
			t.Fatalf("DBError(%s) = %v, want ErrConflict", code, err)
		}
	}
}

func TestDBError_PassthroughNonPg(t *testing.T) {
	original := errors.New("boom")
	err := repository.DBError(original)
	if !errors.Is(err, original) {
		t.Fatalf("DBError(non-pg) = %v, want original", err)
	}
}
