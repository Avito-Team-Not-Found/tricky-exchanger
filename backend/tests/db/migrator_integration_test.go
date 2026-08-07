//go:build integration

package db_test

import (
	"context"
	"os"
	"testing"

	database "github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/database"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sirupsen/logrus"
)

// TestMigrationsApply: миграции применяются к пустой БД, схема создаётся.
func TestMigrationsApply(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping integration test")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	logger := logrus.New()

	if err := database.RunMigrations(ctx, databaseURL, logger); err != nil {
		t.Fatalf("run migrations: %v", err)
	}

	// 1) 9 таблиц существуют
	expected := []string{
		"users", "categories", "items", "exchange_requests",
		"clusters", "cluster_members", "chains", "chain_participants", "votes",
	}
	var n int
	err = pool.QueryRow(ctx,
		`SELECT count(*) FROM information_schema.tables
		 WHERE table_schema='public' AND table_name=ANY($1)`,
		expected,
	).Scan(&n)
	if err != nil {
		t.Fatalf("count tables: %v", err)
	}
	if n != len(expected) {
		t.Fatalf("expected %d tables, got %d", len(expected), n)
	}

	// 2) items.embedding имеет тип vector
	var dataType string
	err = pool.QueryRow(ctx,
		`SELECT udt_name FROM information_schema.columns
		 WHERE table_name='items' AND column_name='embedding'`).Scan(&dataType)
	if err != nil {
		t.Fatalf("get embedding type: %v", err)
	}
	if dataType != "vector" {
		t.Fatalf("expected embedding type 'vector', got %q", dataType)
	}

	// 3) users.id имеет тип uuid
	var uuidType string
	err = pool.QueryRow(ctx,
		`SELECT udt_name FROM information_schema.columns
		 WHERE table_name='users' AND column_name='id'`).Scan(&uuidType)
	if err != nil {
		t.Fatalf("get users.id type: %v", err)
	}
	if uuidType != "uuid" {
		t.Fatalf("expected users.id type 'uuid', got %q", uuidType)
	}

	// 4) FK-нарушение отклоняется (items.owner_user_id ссылается на несуществующий UUID)
	if _, err := pool.Exec(ctx,
		`INSERT INTO items (owner_user_id, title)
		 VALUES ('00000000-0000-0000-0000-000000000000', 'x')`); err == nil {
		t.Fatal("expected FK violation for items.owner_user_id, got nil")
	}

	// 5) UNIQUE на users.email отклоняет дубликат
	mustExec(t, ctx, pool, `TRUNCATE users CASCADE`)
	mustExec(t, ctx, pool,
		`INSERT INTO users (email, password_hash) VALUES ('a@example.com', 'h')`)
	if _, err := pool.Exec(ctx,
		`INSERT INTO users (email, password_hash) VALUES ('a@example.com', 'h')`); err == nil {
		t.Fatal("expected unique violation for duplicate users.email, got nil")
	}
	
	// 6) seed: ровно 20 категорий
	var catCount int
	err = pool.QueryRow(ctx, `SELECT count(*) FROM categories`).Scan(&catCount)
	if err != nil {
		t.Fatalf("count categories: %v", err)
	}
	if catCount != 20 {
		t.Fatalf("expected 20 categories, got %d", catCount)
	}
}

func mustExec(t *testing.T, ctx context.Context, pool *pgxpool.Pool, sql string, args ...interface{}) {
	t.Helper()
	if _, err := pool.Exec(ctx, sql, args...); err != nil {
		t.Fatalf("exec %q: %v", sql, err)
	}
}