package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/sellon/sellon/api/internal/config"
	"github.com/sellon/sellon/api/internal/db"
	"github.com/sellon/sellon/api/internal/email"
	"github.com/sellon/sellon/api/internal/repository"
	"github.com/sellon/sellon/api/internal/scheduler"
	"github.com/sellon/sellon/api/internal/server"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		slog.Error("failed to load config", "err", err)
		os.Exit(1)
	}

	if err := db.Migrate(cfg.DSN(), logger); err != nil {
		slog.Error("migrate failed", "err", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool, err := db.Connect(ctx, cfg.DSN())
	if err != nil {
		slog.Error("db connect failed", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	srv, err := server.New(cfg, logger, pool)
	if err != nil {
		slog.Error("server init failed", "err", err)
		os.Exit(1)
	}

	go func() {
		if err := srv.Start(); err != nil {
			slog.Error("server failed", "err", err)
			os.Exit(1)
		}
	}()

	// Start background schedulers.
	mailer := email.NewMailer(cfg.MailtrapAPIKey, cfg.FromEmail, cfg.FromName, logger)
	users := repository.NewUserRepo(pool)
	tipGen := email.NewTipGenerator(cfg.AnthropicAPIKey, logger)
	dashURL := cfg.PrimaryWebOrigin() + "/dashboard"
	scheduler.NewWeeklyTipsJob(users, mailer, tipGen, dashURL, logger).Start(ctx)

	slog.Info("server started", "port", cfg.Port, "env", cfg.Env)

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("shutdown error", "err", err)
	}
	slog.Info("server stopped")
}
