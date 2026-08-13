package repository_test

import (
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/repository"
)

func TestDBErrToErr_NonPg(t *testing.T) {
	_, ok := repository.DBErrToErr(errors.New("boom"))
	if ok {
		t.Fatal("expected ok=false for non-pg error")
	}
}

func TestDBErrToErr_UniqueViolation(t *testing.T) {
	err, ok := repository.DBErrToErr(&pgconn.PgError{
		Code:    "23505",
		Message: "duplicate key value violates unique constraint",
		Detail:  "Key (email)=(a@b.c) already exists.",
	})
	if !ok {
		t.Fatal("expected ok=true")
	}
	if !errors.Is(err, repository.ErrDuplicateKey) {
		t.Fatalf("got %v, want ErrDuplicateKey", err)
	}
}

func TestDBErrToErr_ForeignKey(t *testing.T) {
	err, ok := repository.DBErrToErr(&pgconn.PgError{
		Code:    "23503",
		Message: "insert or update on table violates foreign key constraint",
		Detail:  "Key (offered_item_id)=(1) is not present in table \"items\".",
	})
	if !ok {
		t.Fatal("expected ok=true")
	}
	if !errors.Is(err, repository.ErrForeignKeyViolated) {
		t.Fatalf("got %v, want ErrForeignKeyViolated", err)
	}
}

func TestDBErrToErr_UndefinedTable(t *testing.T) {
	err, ok := repository.DBErrToErr(&pgconn.PgError{
		Code:    "42P01",
		Message: `relation "missing" does not exist`,
	})
	if !ok {
		t.Fatal("expected ok=true")
	}
	if !errors.Is(err, repository.ErrTableDoesNotExist) {
		t.Fatalf("got %v, want ErrTableDoesNotExist", err)
	}
}

func TestDBErrToErr_ConflictCodes(t *testing.T) {
	for _, code := range []string{"23P01", "40001", "40P01"} {
		err, ok := repository.DBErrToErr(&pgconn.PgError{Code: code, Message: "conflict"})
		if !ok {
			t.Fatalf("code %s: expected ok=true", code)
		}
		if !errors.Is(err, repository.ErrConflict) {
			t.Fatalf("code %s: got %v, want ErrConflict", code, err)
		}
	}
}

func TestDBErrToErr_UnknownCode(t *testing.T) {
	_, ok := repository.DBErrToErr(&pgconn.PgError{Code: "XX000", Message: "internal"})
	if ok {
		t.Fatal("expected ok=false for unknown SQLSTATE")
	}
}

func TestMapDBErr(t *testing.T) {
	if repository.MapDBErr(nil) != nil {
		t.Fatal("MapDBErr(nil) must be nil")
	}
	raw := errors.New("boom")
	if got := repository.MapDBErr(raw); got != raw {
		t.Fatalf("non-pg error must pass through, got %v", got)
	}
	mapped := repository.MapDBErr(&pgconn.PgError{Code: "23505", Message: "dup"})
	if !errors.Is(mapped, repository.ErrDuplicateKey) {
		t.Fatalf("got %v", mapped)
	}
}
