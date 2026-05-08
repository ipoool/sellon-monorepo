package db

import (
	"context"
	"embed"
	"errors"
	"log/slog"
	"time"

	"github.com/golang-migrate/migrate/v4"
	migrateps "github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/jackc/pgx/v5/pgxpool"

	_ "github.com/jackc/pgx/v5/stdlib"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

func Connect(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, err
	}
	cfg.MaxConns = 10
	cfg.MinConns = 1
	cfg.MaxConnLifetime = time.Hour

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}

	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, err
	}
	return pool, nil
}

// Migrate runs embedded SQL migrations forward.
func Migrate(dsn string, logger *slog.Logger) error {
	src, err := iofs.New(migrationsFS, "migrations")
	if err != nil {
		return err
	}

	// Use lib/pq driver via golang-migrate's postgres source.
	// Open a separate sql.DB so we don't tangle pgxpool lifecycles.
	db, err := openSQL(dsn)
	if err != nil {
		return err
	}
	defer db.Close()

	driver, err := migrateps.WithInstance(db, &migrateps.Config{})
	if err != nil {
		return err
	}

	m, err := migrate.NewWithInstance("iofs", src, "postgres", driver)
	if err != nil {
		return err
	}

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return err
	}
	logger.Info("migrations applied")
	return nil
}
