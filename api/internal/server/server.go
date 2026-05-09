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
	"github.com/sellon/sellon/api/internal/storage"
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
	variants := repository.NewVariantRepo(pool)
	promos := repository.NewPromoRepo(pool)
	reports := repository.NewReportsRepo(pool)

	googleVerifier := auth.NewGoogleVerifier(cfg.GoogleClientID)
	jwtSvc := auth.NewJWTService(cfg.JWTSecret, cfg.JWTTTL)
	encryptor, err := auth.NewAESEncryptor(cfg.JWTSecret)
	if err != nil {
		return nil, err
	}

	midtransClient := payments.NewMidtransClient()
	storageClient := storage.NewSupabaseClient(cfg.SupabaseURL, cfg.SupabaseServiceKey, cfg.SupabaseBucket)

	authHandler := handler.NewAuthHandler(users, googleVerifier, jwtSvc, logger, cfg.IsProd())
	storeHandler := handler.NewStoreHandler(stores, logger)
	productHandler := handler.NewProductHandler(products, variants, stores, storageClient, logger)
	orderHandler := handler.NewOrderHandler(orders, stores, gateways, encryptor, midtransClient, logger)
	customerHandler := handler.NewCustomerHandler(customers, orders, stores, logger)
	paymentHandler := handler.NewPaymentHandler(gateways, stores, encryptor, midtransClient, logger, cfg.WebhookBaseURL)
	dashHandler := handler.NewDashboardHandler(stores, products, orders, customers, logger)
	storefrontHandler := handler.NewStorefrontHandler(stores, products, variants, orders, bankAccounts, categories, promos, logger)
	waTemplateHandler := handler.NewWATemplateHandler(waTemplates, stores, logger)
	webhookHandler := handler.NewWebhookHandler(gateways, orders, encryptor, logger)
	bankAccountHandler := handler.NewBankAccountHandler(bankAccounts, stores, logger)
	categoryHandler := handler.NewCategoryHandler(categories, stores, logger)
	promoHandler := handler.NewPromoHandler(promos, stores, logger)
	reportsHandler := handler.NewReportsHandler(stores, reports, logger)

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
			r.Post("/shipping/quote", storefrontHandler.ShippingQuote)
			r.Post("/promos/validate", storefrontHandler.ValidatePromo)
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
				r.Put("/shipping", storeHandler.UpdateShipping)
			})

			r.Route("/products", func(r chi.Router) {
				r.Get("/", productHandler.List)
				r.Post("/", productHandler.Create)
				r.Get("/bulk/template", productHandler.BulkTemplate)
				r.Post("/bulk", productHandler.BulkUpload)
				r.Post("/upload-photo", productHandler.UploadPhoto)
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
				r.Get("/{id}", customerHandler.Get)
				r.Put("/{id}", customerHandler.Update)
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

			r.Route("/promos", func(r chi.Router) {
				r.Get("/", promoHandler.List)
				r.Post("/", promoHandler.Create)
				r.Get("/{id}", promoHandler.Get)
				r.Put("/{id}", promoHandler.Update)
				r.Delete("/{id}", promoHandler.Delete)
			})

			r.Route("/reports", func(r chi.Router) {
				r.Get("/overview", reportsHandler.Overview)
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
