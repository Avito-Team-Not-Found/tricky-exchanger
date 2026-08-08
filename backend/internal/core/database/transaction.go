package database

import (
	"context"
	"fmt"

	trmpgx "github.com/avito-tech/go-transaction-manager/drivers/pgxv5/v2"
	"github.com/avito-tech/go-transaction-manager/trm/v2"
	trmmanager "github.com/avito-tech/go-transaction-manager/trm/v2/manager"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Tx — транзакция PostgreSQL, доступная репозиториям в прикладном сценарии.
type Tx = pgx.Tx

// TransactionManager выполняет прикладной сценарий в одной транзакции.
type TransactionManager interface {
	WithinTransaction(ctx context.Context, fn func(Tx) error) error
}

// PostgresTransactionManager адаптирует go-transaction-manager от Avito к
// текущему контракту сервисов, которым нужен явный pgx.Tx.
type PostgresTransactionManager struct {
	pool    *pgxpool.Pool
	manager trm.Manager
}

// NewTransactionManager создаёт менеджер транзакций для пула PostgreSQL.
func NewTransactionManager(pool *pgxpool.Pool) *PostgresTransactionManager {
	return &PostgresTransactionManager{
		pool:    pool,
		manager: trmmanager.Must(trmpgx.NewDefaultFactory(pool)),
	}
}

// WithinTransaction выполняет fn в транзакции, созданной и завершённой
// go-transaction-manager. Библиотека также корректно обрабатывает rollback,
// panic и вложенные транзакции.
func (m *PostgresTransactionManager) WithinTransaction(ctx context.Context, fn func(Tx) error) error {
	return m.manager.Do(ctx, func(txCtx context.Context) error {
		connection := trmpgx.DefaultCtxGetter.DefaultTrOrDB(txCtx, m.pool)
		tx, ok := connection.(pgx.Tx)
		if !ok {
			return fmt.Errorf("transaction manager did not provide pgx transaction")
		}
		return fn(tx)
	})
}

var _ TransactionManager = (*PostgresTransactionManager)(nil)
