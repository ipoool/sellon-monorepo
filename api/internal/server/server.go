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
	"github.com/sellon/sellon/api/internal/payments"
	"github.com/sellon/sellon/api/internal/repository"
)

type Server struct {
	httpServer *http.Server
	logger     *slog.Logger
	cfg        *config.Config
}

func New(cfg *config.Config, logger *slog.Logger, pool *pgxpool.Pool) (*Server, error) {
	users := repository.NewUserRepo(pool)
	stores := repository.NewStoreRepo(pool)
	products := repository.NewProductRepo(pool)
	orders := repository.NewOrderRepo(pool)
	customers := repository.NewCustomerRepo(pool)
	gateways := repository.NewPaymentRepo(pool)
	waTemplates := repository.NewWATemplateRepo(pool)
	bankAccounts := repository.NewBankAccountRepo(pool)
	categories := repository.NewCategoryRepo(pool)

	googleVerifier := auth.NewGoogleVerifier(cfg.GoogleClientID)
	jwtSvc := auth.NewJWTService(cfg.JWTSecret, cfg.JWTTTL)
	encryptor, err := auth.NewAESEncryptor(cfg.JWTSecret)
	if err != nil {
		return nil, err
	}

	midtransClient := payments.NewMidtransClient()

	authHandler := handler.NewAuthHandler(users, googleVerifier, jwtSvc, logger, cfg.IsProd())
	storeHandler := handler.NewStoreHandler(stores, logger)
	productHandler := handler.NewProductHandler(products, stores, logger)
	orderHandler := handler.NewOrderHandler(orders, stores, gateways, encryptor, midtransClient, logger)
	customerHandler := handler.NewCustomerHandler(customers, stores, logger)
	paymentHandler := handler.NewPaymentHandler(gateways, stores, encryptor, logger, cfg.WebhookBaseURL)
	dashHandler := handler.NewDashboardHandler(stores, products, orders, customers, logger)
	storefrontHandler := handler.NewStorefrontHandler(stores, products, orders, bankAccounts, categories, logger)
	waTemplateHandler := handler.NewWATemplateHandler(waTemplates, stores, logger)
	webhookHandler := handler.NewWebhookHandler(gateways, orders, encryptor, logger)
	bankAccountHandler := handler.NewBankAccountHandler(bankAccounts, stores, logger)
	categoryHandler := handler.NewCategoryHandler(categories, stores, logger)

	requireAuth := middleware.RequireAuth(jwtSvc)

	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(middleware.Logger(logger))
	r.Use(middleware.Recover(logger))
	r.Use(middleware.CORS(cfg.WebOrigin))

	r.Get("/health", handler.Health)

	// Public webhook routes (no auth — token in URL is the secret)
	r.Post("/webhooks/midtrans/{token}", webhookHandler.Midtrans)

	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/info", handler.Info(cfg))

		// Public storefront (no auth)
		r.Route("/storefront/{slug}", func(r chi.Router) {
			r.Get("/", storefrontHandler.GetStore)
			r.Get("/products/{productSlug}", storefrontHandler.GetProduct)
			r.Post("/orders", storefrontHandler.CreateOrder)
			r.Get("/orders/{number}", storefrontHandler.GetOrder)
			r.Post("/orders/{number}/mark-paid", storefrontHandler.MarkPaymentPending)
		})

		r.Route("/auth", func(r chi.Router) {
			r.Post("/google", authHandler.Google)
			r.Post("/logout", authHandler.Logout)
			r.Group(func(r chi.Router) {
				r.Use(requireAuth)
				r.Get("/me", authHandler.Me)
			})
		})

		// All resource routes below require auth.
		r.Group(func(r chi.Router) {
			r.Use(requireAuth)

			r.Get("/dashboard/stats", dashHandler.Stats)

			r.Route("/store", func(r chi.Router) {
				r.Get("/", storeHandler.Get)
				r.Post("/", storeHandler.Create)
				r.Put("/", storeHandler.Update)
			})

			r.Route("/products", func(r chi.Router) {
				r.Get("/", productHandler.List)
				r.Post("/", productHandler.Create)
				r.Get("/bulk/template", productHandler.BulkTemplate)
				r.Post("/bulk", productHandler.BulkUpload)
				r.Get("/{id}", productHandler.Get)
				r.Put("/{id}", productHandler.Update)
				r.Delete("/{id}", productHandler.Delete)
			})

			r.Route("/orders", func(r chi.Router) {
				r.Get("/", orderHandler.List)
				r.Get("/export", orderHandler.Export)
				r.Get("/{id}", orderHandler.Get)
				r.Patch("/{id}/status", orderHandler.UpdateStatus)
				r.Patch("/{id}/notes", orderHandler.UpdateNotes)
				r.Post("/{id}/payment-link", orderHandler.GeneratePaymentLink)
			})

			r.Route("/customers", func(r chi.Router) {
				r.Get("/", customerHandler.List)
				r.Get("/export", customerHandler.ExportCSV)
			})

			r.Route("/payments/midtrans", func(r chi.Router) {
				r.Get("/", paymentHandler.Get)
				r.Put("/", paymentHandler.Save)
				r.Post("/verify", paymentHandler.Verify)
				r.Post("/rotate-webhook", paymentHandler.RotateWebhook)
			})

			r.Route("/whatsapp-templates", func(r chi.Router) {
				r.Get("/", waTemplateHandler.Get)
				r.Put("/", waTemplateHandler.Save)
			})

			r.Route("/bank-accounts", func(r chi.Router) {
				r.Get("/", bankAccountHandler.List)
				r.Post("/", bankAccountHandler.Create)
				r.Put("/{id}", bankAccountHandler.Update)
				r.Delete("/{id}", bankAccountHandler.Delete)
			})

			r.Route("/categories", func(r chi.Router) {
				r.Get("/", categoryHandler.List)
				r.Post("/", categoryHandler.Create)
				r.Put("/{id}", categoryHandler.Update)
				r.Delete("/{id}", categoryHandler.Delete)
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
	}, nil
}

func (s *Server) Start() error {
	return s.httpServer.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	return s.httpServer.Shutdown(ctx)
}
