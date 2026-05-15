package server

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sellon/sellon/api/internal/audit"
	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/config"
	"github.com/sellon/sellon/api/internal/email"
	"github.com/sellon/sellon/api/internal/events"
	"github.com/sellon/sellon/api/internal/fulfillment"
	"github.com/sellon/sellon/api/internal/handler"
	"github.com/sellon/sellon/api/internal/middleware"
	"github.com/sellon/sellon/api/internal/notify"
	"github.com/sellon/sellon/api/internal/payments"
	"github.com/sellon/sellon/api/internal/repository"
	"github.com/sellon/sellon/api/internal/shipping/rajaongkir"
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
	subscriptions := repository.NewSubscriptionRepo(pool)
	memberships := repository.NewMembershipRepo(pool)
	auditRepo := repository.NewAuditRepo(pool)
	platformAuditRepo := repository.NewPlatformAuditRepo(pool)
	adminRepo := repository.NewAdminRepo(pool)
	planRepo := repository.NewPlanRepo(pool)
	downloadTokens := repository.NewDownloadTokenRepo(pool)
	bulkJobs := repository.NewBulkJobRepo(pool)

	googleVerifier := auth.NewGoogleVerifier(cfg.GoogleClientID)
	jwtSvc := auth.NewJWTService(cfg.JWTSecret, cfg.JWTTTL)
	encryptor, err := auth.NewAESEncryptor(cfg.JWTSecret)
	if err != nil {
		return nil, err
	}

	midtransClient := payments.NewMidtransClient()
	storageClient := storage.NewSupabaseClient(cfg.SupabaseURL, cfg.SupabaseServiceKey, cfg.SupabaseBucket)
	broker := events.NewBroker()
	rajaOngkir := rajaongkir.New(cfg.RajaOngkirAPIKey, cfg.RajaOngkirTier)
	auditLogger := audit.New(auditRepo, users, logger)
	mailer := email.NewMailer(cfg.MailtrapAPIKey, cfg.FromEmail, cfg.FromName, logger)
	twilioClient := notify.NewTwilio(cfg.TwilioAccountSID, cfg.TwilioAuthToken, cfg.TwilioWhatsAppFrom, logger)
	// PrimaryWebOrigin: single canonical URL untuk link email/notif.
	// WebOrigin (raw, comma-separated) tetap dipakai oleh CORS middleware.
	publicWebURL := cfg.PrimaryWebOrigin()
	fulfiller := fulfillment.New(orders, stores, downloadTokens, mailer, publicWebURL, logger)

	authHandler := handler.NewAuthHandler(users, memberships, googleVerifier, jwtSvc, mailer, publicWebURL, logger, cfg.IsProd())
	storeHandler := handler.NewStoreHandler(stores, subscriptions, auditLogger, logger)
	productHandler := handler.NewProductHandler(products, variants, stores, subscriptions, planRepo, bulkJobs, storageClient, broker, auditLogger, logger)
	uploadHandler := handler.NewUploadHandler(stores, storageClient, logger)
	orderHandler := handler.NewOrderHandler(orders, stores, gateways, encryptor, midtransClient, auditLogger, fulfiller, mailer, publicWebURL, logger)
	customerHandler := handler.NewCustomerHandler(customers, orders, stores, auditLogger, logger)
	paymentHandler := handler.NewPaymentHandler(gateways, stores, encryptor, midtransClient, auditLogger, logger, cfg.WebhookBaseURL)
	dashHandler := handler.NewDashboardHandler(stores, products, orders, customers, logger)
	storefrontHandler := handler.NewStorefrontHandler(
		stores, products, variants, orders, bankAccounts, categories, promos, gateways,
		subscriptions, planRepo, users, waTemplates, broker, rajaOngkir, mailer, twilioClient,
		storageClient, auditLogger, publicWebURL, logger,
	)
	orderStreamHandler := handler.NewOrderStreamHandler(stores, broker, logger)
	citiesHandler := handler.NewCitiesHandler(rajaOngkir, logger)
	waTemplateHandler := handler.NewWATemplateHandler(waTemplates, stores, auditLogger, logger)
	webhookHandler := handler.NewWebhookHandler(gateways, orders, stores, users, encryptor, mailer, fulfiller, publicWebURL, logger)
	bankAccountHandler := handler.NewBankAccountHandler(bankAccounts, stores, auditLogger, logger)
	categoryHandler := handler.NewCategoryHandler(categories, stores, auditLogger, logger)
	promoHandler := handler.NewPromoHandler(promos, stores, subscriptions, planRepo, auditLogger, logger)
	reportsHandler := handler.NewReportsHandler(stores, reports, logger)
	subscriptionHandler := handler.NewSubscriptionHandler(
		subscriptions, stores, products, orders, users, planRepo,
		midtransClient, cfg.PlatformMidtransServerKey, cfg.PlatformMidtransSandbox,
		auditLogger, logger,
	)
	plansHandler := handler.NewPlansHandler(planRepo, logger)
	adminPlansHandler := handler.NewAdminPlansHandler(planRepo, platformAuditRepo, users, logger)
	downloadHandler := handler.NewDownloadHandler(downloadTokens, logger)
	platformWebhookHandler := handler.NewPlatformWebhookHandler(
		subscriptions, cfg.PlatformMidtransServerKey, auditLogger, logger,
	)
	staffHandler := handler.NewStaffHandler(stores, memberships, users, subscriptions, planRepo, auditLogger, logger)
	auditHandler := handler.NewAuditHandler(auditRepo, stores, users, logger)
	adminHandler := handler.NewAdminHandler(
		users, stores, adminRepo, platformAuditRepo, auditRepo, subscriptions,
		storageClient, jwtSvc, cfg.IsProd(), logger,
	)

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
	// Platform-billing webhook (SaaS subscription payments). Public — auth
	// is the SHA512 signature_key Midtrans includes in the body.
	r.Post("/webhooks/platform/midtrans", platformWebhookHandler.Handle)

	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/info", handler.Info(cfg))
		// Pricing — public so the landing page can fetch without auth.
		r.Get("/plans", plansHandler.ListPublic)
		// Public digital-download link — no auth, token in URL is the
		// secret. Random 256-bit token = unguessable.
		r.Get("/download/{token}", downloadHandler.Get)
		// City autocomplete — public so both buyer checkout and seller
		// settings can reach it.
		r.Get("/cities/search", citiesHandler.Search)

		// Public storefront (no auth)
		r.Route("/storefront/{slug}", func(r chi.Router) {
			r.Get("/", storefrontHandler.GetStore)
			r.Get("/products/{productSlug}", storefrontHandler.GetProduct)
			r.Post("/orders", storefrontHandler.CreateOrder)
			r.Get("/orders/{number}", storefrontHandler.GetOrder)
			r.Post("/orders/{number}/mark-paid", storefrontHandler.MarkPaymentPending)
			r.Post("/orders/{number}/payment-proof", storefrontHandler.UploadPaymentProof)
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

			// Seller-only routes: admin accounts are blocked here. During
			// impersonation the JWT uid is the impersonated seller's, so
			// RequireSeller correctly allows access.
			r.Group(func(r chi.Router) {
				r.Use(middleware.RequireSeller(users))

				r.Get("/dashboard/stats", dashHandler.Stats)

				r.Route("/store", func(r chi.Router) {
					r.Get("/", storeHandler.Get)
					r.Post("/", storeHandler.Create)
					r.Put("/", storeHandler.Update)
					r.Put("/shipping", storeHandler.UpdateShipping)
					r.Put("/storefront", storeHandler.UpdateStorefront)
				})

				r.Route("/products", func(r chi.Router) {
					r.Get("/", productHandler.List)
					r.Post("/", productHandler.Create)
					r.Get("/bulk/template", productHandler.BulkTemplate)
					r.Post("/bulk", productHandler.BulkUpload)
					r.Post("/bulk-delete", productHandler.BulkDelete)
					r.Get("/bulk/jobs/active", productHandler.BulkJobsActive)
					r.Get("/bulk/jobs/stream", productHandler.BulkJobsStream)
					r.Get("/bulk/jobs/{id}", productHandler.BulkJobGet)
					r.Get("/{id}", productHandler.Get)
					r.Put("/{id}", productHandler.Update)
					r.Delete("/{id}", productHandler.Delete)
					r.Post("/{id}/duplicate", productHandler.Duplicate)
				})

				r.Post("/uploads/image", uploadHandler.Image)
				r.Post("/uploads/delete", uploadHandler.Delete)

				r.Route("/orders", func(r chi.Router) {
					r.Get("/", orderHandler.List)
					r.Get("/export", orderHandler.Export)
					r.Get("/stream", orderStreamHandler.Stream)
					r.Get("/{id}", orderHandler.Get)
					r.Patch("/{id}/status", orderHandler.UpdateStatus)
					r.Patch("/{id}/notes", orderHandler.UpdateNotes)
					r.Post("/{id}/payment-link", orderHandler.GeneratePaymentLink)
					r.Post("/{id}/wa-log", orderHandler.LogWASend)
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

				r.Route("/subscription", func(r chi.Router) {
					r.Get("/", subscriptionHandler.Get)
					r.Post("/request-upgrade", subscriptionHandler.RequestUpgrade)
					r.Post("/checkout", subscriptionHandler.Checkout)
					r.Post("/cancel", subscriptionHandler.Cancel)
					r.Post("/resume", subscriptionHandler.Resume)
				})

				r.Route("/staff", func(r chi.Router) {
					r.Get("/", staffHandler.List)
					r.Post("/invite", staffHandler.Invite)
					r.Delete("/{user_id}", staffHandler.Remove)
					r.Put("/{user_id}/role", staffHandler.ChangeRole)
					r.Delete("/invites/{invite_id}", staffHandler.DeleteInvite)
				})

				r.Get("/audit-log", auditHandler.List)
			})

			// Platform admin routes — gated by RequireAdmin (which itself
			// requires RequireAuth, already applied at the parent group).
			r.Route("/admin", func(r chi.Router) {
				r.Use(middleware.RequireAdmin(users))
				r.Get("/stats", adminHandler.Stats)
				r.Get("/users", adminHandler.ListUsers)
				r.Get("/users/{id}", adminHandler.GetUser)
				r.Post("/users/{id}/ban", adminHandler.BanUser)
				r.Post("/users/{id}/unban", adminHandler.UnbanUser)
				r.Delete("/users/{id}", adminHandler.DeleteUser)
				r.Post("/users/{id}/impersonate", adminHandler.Impersonate)
				r.Get("/users/{id}/audit", adminHandler.UserAudit)
				r.Get("/stores", adminHandler.ListStores)
				r.Get("/plans", adminPlansHandler.List)
				r.Put("/plans/{tier}", adminPlansHandler.Update)
				r.Get("/subscriptions/invoices", adminHandler.ListInvoices)
				r.Post("/subscriptions/invoices/{id}/activate", adminHandler.ActivateInvoice)
				r.Post("/subscriptions/invoices/{id}/reject", adminHandler.RejectInvoice)
				r.Post("/stores/{storeID}/subscription", adminHandler.GrantSubscription)
			})
			// Exit impersonation lives outside /admin — the caller's
			// session is currently the impersonated USER, not the admin,
			// so RequireAdmin would (correctly) reject. The handler
			// re-promotes back to the admin's own token.
			r.Post("/auth/exit-impersonation", adminHandler.ExitImpersonation)
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
