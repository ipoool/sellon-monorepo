package server

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/tokoflow/tokoflow/apps/api/internal/config"
	"github.com/tokoflow/tokoflow/apps/api/internal/handler"
	"github.com/tokoflow/tokoflow/apps/api/internal/middleware"
)

type Server struct {
	httpServer *http.Server
	logger     *slog.Logger
	cfg        *config.Config
}

func New(cfg *config.Config, logger *slog.Logger) *Server {
	r := chi.NewRouter()

	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(middleware.Logger(logger))
	r.Use(middleware.Recover(logger))
	r.Use(middleware.CORS())

	r.Get("/health", handler.Health)
	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/info", handler.Info(cfg))
	})

	return &Server{
		cfg:    cfg,
		logger: logger,
		httpServer: &http.Server{
			Addr:         ":" + cfg.Port,
			Handler:      r,
			ReadTimeout:  10 * time.Second,
			WriteTimeout: 10 * time.Second,
			IdleTimeout:  60 * time.Second,
		},
	}
}

func (s *Server) Start() error {
	return s.httpServer.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	return s.httpServer.Shutdown(ctx)
}
