package server

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sellon/sellon/api/internal/ai"
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
	resellerRepo := repository.NewResellerRepo(pool)
	posRepo := repository.NewPOSRepo(pool)
	productDiscounts := repository.NewProductDiscountRepo(pool)
	materialRepo := repository.NewMaterialRepo(pool)
	membershipTierRepo := repository.NewMembershipTierRepo(pool)
	supplierRepo := repository.NewSupplierRepo(pool)
	purchaseOrderRepo := repository.NewPurchaseOrderRepo(pool)
	stockTakeRepo := repository.NewStockTakeRepo(pool)
	cashEntryRepo := repository.NewCashEntryRepo(pool)
	analyticsRepo := repository.NewAnalyticsRepo(pool)
	tableRepo := repository.NewTableRepo(pool)
	kitchenRepo := repository.NewKitchenRepo(pool)
	modifierRepo := repository.NewModifierRepo(pool)
	bannerRepo := repository.NewBannerRepo(pool)

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
	productHandler := handler.NewProductHandler(products, variants, stores, subscriptions, planRepo, bulkJobs, productDiscounts, modifierRepo, materialRepo, categories, storageClient, broker, auditLogger, logger)
	uploadHandler := handler.NewUploadHandler(stores, storageClient, logger)
	orderHandler := handler.NewOrderHandler(orders, stores, gateways, encryptor, midtransClient, auditLogger, fulfiller, mailer, publicWebURL, logger)
	customerHandler := handler.NewCustomerHandler(customers, orders, stores, auditLogger, logger)
	materialHandler := handler.NewMaterialHandler(materialRepo, stores, subscriptions, auditLogger, logger)
	membershipHandler := handler.NewMembershipHandler(membershipTierRepo, stores, subscriptions, auditLogger, logger)
	purchasingHandler := handler.NewPurchasingHandler(supplierRepo, purchaseOrderRepo, stockTakeRepo, stores, subscriptions, auditLogger, logger)
	anthropicClient := ai.NewAnthropicClient(cfg.AnthropicAPIKey, logger)
	analyticsHandler := handler.NewAnalyticsHandler(analyticsRepo, cashEntryRepo, stores, subscriptions, reports, products, users, anthropicClient, mailer, publicWebURL, auditLogger, logger)
	tableHandler := handler.NewTableHandler(tableRepo, stores, subscriptions, auditLogger, logger)
	kdsHandler := handler.NewKDSHandler(kitchenRepo, stores, broker, logger)
	bannerHandler := handler.NewBannerHandler(bannerRepo, storageClient, logger)
	paymentHandler := handler.NewPaymentHandler(gateways, stores, encryptor, midtransClient, auditLogger, logger, cfg.WebhookBaseURL)
	dashHandler := handler.NewDashboardHandler(stores, products, orders, customers, logger)
	storefrontHandler := handler.NewStorefrontHandler(
		stores, products, variants, orders, bankAccounts, categories, promos, gateways,
		subscriptions, planRepo, users, waTemplates, modifierRepo, tableRepo, broker, rajaOngkir, mailer, twilioClient,
		storageClient, auditLogger, publicWebURL, logger,
	)
	orderStreamHandler := handler.NewOrderStreamHandler(stores, broker, logger)
	citiesHandler := handler.NewCitiesHandler(rajaOngkir, logger)
	waTemplateHandler := handler.NewWATemplateHandler(waTemplates, stores, auditLogger, logger)
	webhookHandler := handler.NewWebhookHandler(gateways, orders, stores, users, encryptor, mailer, fulfiller, publicWebURL, logger)
	bankAccountHandler := handler.NewBankAccountHandler(bankAccounts, stores, auditLogger, logger)
	categoryHandler := handler.NewCategoryHandler(categories, stores, auditLogger, logger)
	promoHandler := handler.NewPromoHandler(promos, stores, subscriptions, planRepo, auditLogger, logger)
	reportsHandler := handler.NewReportsHandler(stores, reports, orders, subscriptions, anthropicClient, logger)
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
	staffHandler := handler.NewStaffHandler(stores, memberships, users, subscriptions, planRepo, mailer, publicWebURL, auditLogger, logger)
	domainHandler := handler.NewDomainHandler(stores, subscriptions, auditLogger, cfg.CnameTarget, logger)
	auditHandler := handler.NewAuditHandler(auditRepo, stores, users, logger)
	resellerHandler := handler.NewResellerHandler(resellerRepo, stores, subscriptions, auditLogger, mailer, twilioClient, logger)
	posHandler := handler.NewPOSHandler(posRepo, stores, products, variants, orders, customers, memberships, subscriptions, waTemplates, users, modifierRepo, materialRepo, membershipTierRepo, twilioClient, auditLogger, logger)
	adminHandler := handler.NewAdminHandler(
		users, stores, adminRepo, platformAuditRepo, auditRepo, subscriptions,
		planRepo, storageClient, jwtSvc, mailer, publicWebURL, cfg.IsProd(), logger,
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

		// Public domain → slug resolution for Next.js middleware.
		// Must be registered BEFORE /storefront/{slug} so chi resolves
		// the static segment "domain-lookup" before the wildcard {slug}.
		r.Get("/storefront/domain-lookup", storefrontHandler.DomainLookup)

		// Public table QR resolution (scan a table → store + table).
		r.Get("/tables/resolve/{token}", tableHandler.Resolve)

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
			r.Get("/queue", kdsHandler.PublicQueue)
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

				// Platform promo/info banners for the dashboard slider (read-only
				// for sellers; admins manage them under /admin/banners).
				r.Get("/banners", bannerHandler.ListActive)

				r.Route("/store", func(r chi.Router) {
					r.Get("/", storeHandler.Get)
					r.Post("/", storeHandler.Create)
					r.Put("/", storeHandler.Update)
					r.Put("/shipping", storeHandler.UpdateShipping)
					r.Put("/storefront", storeHandler.UpdateStorefront)
					r.Put("/checkout-config", storeHandler.UpdateCheckoutConfig)
					r.Put("/custom-domain", domainHandler.Set)
					r.Post("/custom-domain/verify", domainHandler.Verify)
					r.Delete("/custom-domain", domainHandler.Delete)
					r.Get("/dinein", tableHandler.GetDineIn)
					r.Put("/dinein", tableHandler.UpdateDineIn)
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
					r.Put("/{id}/discounts", productHandler.SetDiscounts)
					r.Put("/{id}/modifiers", productHandler.SetModifiers)
				})

				r.Route("/membership", func(r chi.Router) {
					r.Get("/tiers", membershipHandler.ListTiers)
					r.Put("/tiers", membershipHandler.ReplaceTiers)
				})
				r.Route("/suppliers", func(r chi.Router) {
					r.Get("/", purchasingHandler.ListSuppliers)
					r.Post("/", purchasingHandler.CreateSupplier)
					r.Put("/{id}", purchasingHandler.UpdateSupplier)
					r.Delete("/{id}", purchasingHandler.DeleteSupplier)
				})
				r.Route("/purchase-orders", func(r chi.Router) {
					r.Get("/", purchasingHandler.ListPOs)
					r.Post("/", purchasingHandler.CreatePO)
					r.Get("/{id}", purchasingHandler.GetPO)
					r.Post("/{id}/status", purchasingHandler.SetPOStatus)
					r.Post("/{id}/receive", purchasingHandler.ReceivePO)
				})
				r.Route("/stock-takes", func(r chi.Router) {
					r.Get("/", purchasingHandler.ListStockTakes)
					r.Post("/", purchasingHandler.CreateStockTake)
					r.Get("/{id}", purchasingHandler.GetStockTake)
					r.Post("/{id}/post", purchasingHandler.PostStockTake)
				})
				r.Get("/analytics/overview", analyticsHandler.Overview)
				r.Post("/analytics/ai-summary", analyticsHandler.AiSummary)
				r.Get("/analytics/ai-summary/stream", analyticsHandler.AiSummaryStream)
				r.Route("/cash-entries", func(r chi.Router) {
					r.Get("/", analyticsHandler.ListCashEntries)
					r.Post("/", analyticsHandler.CreateCashEntry)
					r.Delete("/{id}", analyticsHandler.DeleteCashEntry)
				})
				r.Route("/tables", func(r chi.Router) {
					r.Get("/", tableHandler.List)
					r.Post("/", tableHandler.Create)
					r.Put("/{id}", tableHandler.Update)
					r.Delete("/{id}", tableHandler.Delete)
				})
				r.Route("/kds", func(r chi.Router) {
					r.Get("/orders", kdsHandler.List)
					r.Post("/orders/{id}/bump", kdsHandler.Bump)
					r.Get("/stream", kdsHandler.Stream)
				})
				r.Route("/materials", func(r chi.Router) {
					r.Get("/", materialHandler.List)
					r.Get("/summary", materialHandler.Summary)
					r.Post("/", materialHandler.Create)
					r.Get("/report", materialHandler.GetReport)
					r.Get("/report.csv", materialHandler.ExportReportCSV)
					r.Put("/{id}", materialHandler.Update)
					r.Delete("/{id}", materialHandler.Delete)
					r.Post("/{id}/restock", materialHandler.Restock)
					r.Post("/{id}/adjust", materialHandler.Adjust)
					r.Get("/{id}/movements", materialHandler.ListMovements)
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
					r.Post("/{id}/member-code", customerHandler.GenerateMemberCode)
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
					r.Get("/export", reportsHandler.Export)
					r.Post("/ai-insight", reportsHandler.AiInsight)
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

				r.Route("/reseller", func(r chi.Router) {
					// Supplier: program management (Pro/Bisnis only enforced per-handler)
					r.Post("/programs", resellerHandler.CreateProgram)
					r.Get("/programs", resellerHandler.ListMyPrograms)
					r.Get("/programs/{id}", resellerHandler.GetProgram)
					r.Put("/programs/{id}", resellerHandler.UpdateProgram)
					r.Post("/programs/{id}/products", resellerHandler.SetProgramProducts)
					r.Get("/programs/{id}/products", resellerHandler.ListProgramProducts)
					r.Get("/programs/{id}/members", resellerHandler.ListProgramMembers)
					r.Post("/programs/{id}/regenerate-code", resellerHandler.RegenerateInviteCode)
					// Supplier: fulfill dropship orders
					r.Get("/supplier/orders", resellerHandler.ListSupplierOrders)
					r.Patch("/supplier/orders/{orderItemID}/ship", resellerHandler.MarkDropshipShipped)
					// Reseller: join & manage (all tiers)
					r.Get("/invite/preview", resellerHandler.PreviewInviteCode)
					r.Post("/join", resellerHandler.JoinProgram)
					r.Get("/memberships", resellerHandler.ListMemberships)
					r.Get("/memberships/{id}/products", resellerHandler.ListAvailableProducts)
					r.Post("/catalog", resellerHandler.ImportProduct)
					r.Get("/catalog", resellerHandler.ListCatalog)
					r.Delete("/catalog/{id}", resellerHandler.RemoveFromCatalog)
					r.Put("/catalog/{id}/price", resellerHandler.UpdateCatalogPrice)
				})

				r.Route("/pos", func(r chi.Router) {
					// Sessions
					r.Post("/sessions", posHandler.OpenSession)
					r.Get("/sessions", posHandler.ListSessions)
					r.Get("/sessions/active", posHandler.GetActiveSession)
					r.Get("/sessions/{id}", posHandler.GetSession)
					r.Get("/sessions/{id}/summary", posHandler.GetSessionSummary)
					r.Get("/sessions/{id}/orders", posHandler.ListSessionOrders)
					r.Get("/sessions/{id}/orders.csv", posHandler.ExportSessionOrdersCSV)
					r.Post("/sessions/{id}/close", posHandler.CloseSession)
					// Cash movements
					r.Post("/sessions/{id}/cash-movements", posHandler.AddCashMovement)
					r.Get("/sessions/{id}/cash-movements", posHandler.ListCashMovements)
					// Orders
					r.Post("/orders", posHandler.CreatePOSOrder)
					r.Post("/orders/{id}/void", posHandler.VoidOrder)
					r.Post("/orders/{id}/return", posHandler.ReturnOrder)
					r.Post("/orders/{id}/send-receipt", posHandler.SendReceiptWA)
					// Held orders
					r.Post("/held", posHandler.CreateHeldOrder)
					r.Get("/held", posHandler.ListHeldOrders)
					r.Delete("/held/{id}", posHandler.DeleteHeldOrder)
					// Reports
					r.Get("/cashiers", posHandler.ListCashiers)
					r.Get("/reports", posHandler.GetReport)
					r.Get("/reports.csv", posHandler.ExportReportCSV)
					// Loyalty
					r.Get("/loyalty/config", posHandler.GetLoyaltyConfig)
					r.Put("/loyalty/config", posHandler.UpdateLoyaltyConfig)
					r.Get("/members/resolve/{code}", posHandler.ResolveMember)
					r.Get("/printer/config", posHandler.GetPrinterConfig)
					r.Put("/printer/config", posHandler.UpdatePrinterConfig)
					r.Get("/customers/lookup", posHandler.LookupCustomer)
					r.Get("/customers/search", posHandler.SearchCustomers)
					r.Get("/customers/{customerID}/loyalty/transactions", posHandler.ListLoyaltyTransactions)
				})
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
				r.Get("/banners", bannerHandler.ListAdmin)
				r.Post("/banners", bannerHandler.Create)
				r.Put("/banners/{id}", bannerHandler.Update)
				r.Delete("/banners/{id}", bannerHandler.Delete)
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
