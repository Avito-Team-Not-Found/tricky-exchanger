package database

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Tx — транзакция PostgreSQL, доступная репозиториям в прикладном сценарии.
type Tx = pgx.Tx

// TransactionManager выполняет прикладной сценарий в одной транзакции.
type TransactionManager interface {
	WithinTransaction(ctx context.Context, fn func(Tx) error) error
}

// PostgresTransactionManager открывает и завершает транзакции PostgreSQL.
type PostgresTransactionManager struct {
	pool *pgxpool.Pool
}

// NewTransactionManager создаёт менеджер транзакций для пула PostgreSQL.
func NewTransactionManager(pool *pgxpool.Pool) *PostgresTransactionManager {
	return &PostgresTransactionManager{pool: pool}
}

// WithinTransaction выполняет fn атомарно и откатывает изменения при ошибке.
func (m *PostgresTransactionManager) WithinTransaction(ctx context.Context, fn func(Tx) error) error {
	tx, err := m.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := fn(tx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}
	return nil
}

var _ TransactionManager = (*PostgresTransactionManager)(nil)
