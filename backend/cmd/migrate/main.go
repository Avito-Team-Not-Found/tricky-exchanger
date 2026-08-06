// Command migrate применяет/откатывает SQL-миграции из backend/migrations
// к базе данных, заданной в DATABASE_URL.
//
// Использование:
//
//	go run ./cmd/migrate up
//	go run ./cmd/migrate down
package main

import (
	"errors"
	"log"
	"os"
	"strings"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/joho/godotenv"
)

const migrationsPath = "file://migrations"

func main() {
	_ = godotenv.Load()

	if len(os.Args) < 2 {
		log.Fatalf("usage: migrate <up|down>")
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatalf("DATABASE_URL is required")
	}

	// database/pgx/v5-драйвер golang-migrate регистрируется под схемой "pgx5",
	// а не "postgres"/"postgresql", которые использует остальное приложение (pgxpool.New).
	migrateURL := "pgx5://" + strings.TrimPrefix(strings.TrimPrefix(dbURL, "postgres://"), "postgresql://")

	m, err := migrate.New(migrationsPath, migrateURL)
	if err != nil {
		log.Fatalf("init migrate: %v", err)
	}
	defer func() {
		srcErr, dbErr := m.Close()
		if srcErr != nil {
			log.Printf("close migration source: %v", srcErr)
		}
		if dbErr != nil {
			log.Printf("close migration db: %v", dbErr)
		}
	}()

	switch os.Args[1] {
	case "up":
		err = m.Up()
	case "down":
		err = m.Down()
	default:
		log.Fatalf("unknown command %q, expected up or down", os.Args[1])
	}

	if err != nil && !errors.Is(err, migrate.ErrNoChange) {
		log.Fatalf("migrate %s: %v", os.Args[1], err)
	}

	log.Printf("migrate %s: done", os.Args[1])
}
