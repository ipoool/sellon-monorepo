package server

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/config"
	"github.com/sellon/sellon/api/internal/handler"
	"github.com/sellon/sellon/api/internal/middleware"
	"github.com/sellon/sellon/api/internal/repository"
)

type Server struct {
	httpServer *http.Server
	logger     *slog.Logger
	cfg        *config.Config
}

func New(cfg *config.Config, logger *slog.Logger, pool *pgxpool.Pool) *Server {
	users := repository.NewUserRepo(pool)
	googleVerifier := auth.NewGoogleVerifier(cfg.GoogleClientID)
	jwtSvc := auth.NewJWTService(cfg.JWTSecret, cfg.JWTTTL)

	authHandler := handler.NewAuthHandler(users, googleVerifier, jwtSvc, logger, cfg.IsProd())
	requireAuth := middleware.RequireAuth(jwtSvc)

	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(middleware.Logger(logger))
	r.Use(middleware.Recover(logger))
	r.Use(middleware.CORS(cfg.WebOrigin))

	r.Get("/health", handler.Health)
	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/info", handler.Info(cfg))

		r.Route("/auth", func(r chi.Router) {
			r.Post("/google", authHandler.Google)
			r.Post("/logout", authHandler.Logout)

			r.Group(func(r chi.Router) {
				r.Use(requireAuth)
				r.Get("/me", authHandler.Me)
			})
		})
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
