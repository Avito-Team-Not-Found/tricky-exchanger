package database

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"

	_ "github.com/jackc/pgx/v5/stdlib" // регистрирует драйвер "pgx" для database/sql
	"github.com/pressly/goose/v3"
	"github.com/sirupsen/logrus"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/migrations"
)

// RunMigrations применяет все SQL-миграции к базе через goose.NewProvider.
func RunMigrations(ctx context.Context, databaseURL string, logger *logrus.Logger) error {
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return fmt.Errorf("open migration db: %w", err)
	}
	defer db.Close()

	db.SetMaxOpenConns(1)

	migrationsFS, err := fs.Sub(migrations.FS, "migrations")
	if err != nil {
		return fmt.Errorf("sub migrations fs: %w", err)
	}

	provider, err := goose.NewProvider(
		goose.DialectPostgres,
		db,
		migrationsFS,
		goose.WithLogger(&gooseLogger{logger: logger}),
	)
	if err != nil {
		return fmt.Errorf("new migration provider: %w", err)
	}

	if _, err := provider.Up(ctx); err != nil {
		return fmt.Errorf("run migrations: %w", err)
	}
	return nil
}

// gooseLogger адаптирует logrus к интерфейсу goose.Logger.
type gooseLogger struct {
	logger *logrus.Logger
}

func (g *gooseLogger) Fatalf(format string, v ...interface{}) { g.logger.Errorf(format, v...) }
func (g *gooseLogger) Errorf(format string, v ...interface{}) { g.logger.Errorf(format, v...) }
func (g *gooseLogger) Warnf(format string, v ...interface{})  { g.logger.Warnf(format, v...) }
func (g *gooseLogger) Infof(format string, v ...interface{})  { g.logger.Infof(format, v...) }
func (g *gooseLogger) Debugf(format string, v ...interface{}) { g.logger.Debugf(format, v...) }
func (g *gooseLogger) Printf(format string, v ...interface{}) { g.logger.Infof(format, v...) }