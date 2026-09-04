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
	"github.com/sellon/sellon/api/internal/domain/feature"
	"github.com/sellon/sellon/api/internal/email"
	"github.com/sellon/sellon/api/internal/events"
	"github.com/sellon/sellon/api/internal/fulfillment"
	"github.com/sellon/sellon/api/internal/handler"
	"github.com/sellon/sellon/api/internal/meta"
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
	emailVerifications := repository.NewEmailVerificationRepo(pool)
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
	downloadLogs := repository.NewDownloadLogRepo(pool)
	bulkJobs := repository.NewBulkJobRepo(pool)
	resellerRepo := repository.NewResellerRepo(pool)
	posRepo := repository.NewPOSRepo(pool)
	productDiscounts := repository.NewProductDiscountRepo(pool)
	courseVideos := repository.NewCourseVideoRepo(pool)
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
	sellerBannerRepo := repository.NewSellerBannerRepo(pool)

	googleVerifier := auth.NewGoogleVerifier(cfg.GoogleClientID)
	jwtSvc := auth.NewJWTService(cfg.JWTSecret, cfg.JWTTTL)
	encryptor, err := auth.NewAESEncryptor(cfg.JWTSecret)
	if err != nil {
		return nil, err
	}

	midtransClient := payments.NewMidtransClient()
	// Uploads go to the S3-compatible bucket. The Supabase client stays
	// wired only so assets uploaded before the migration can still be
	// resolved from their stored public URL and deleted; NewMultiClient
	// collapses to the S3 client alone once SUPABASE_* is unset.
	s3Storage := storage.NewS3Client(cfg.S3Endpoint, cfg.S3Region, cfg.S3Bucket,
		cfg.S3AccessKey, cfg.S3SecretKey, cfg.S3PublicBaseURL)
	legacyStorage := storage.NewSupabaseClient(cfg.SupabaseURL, cfg.SupabaseServiceKey, cfg.SupabaseBucket)
	storageClient := storage.NewMultiClient(s3Storage, legacyStorage)
	logger.Info("object storage",
		"backend", "s3 (private bucket, served via /api/v1/files)",
		"endpoint", cfg.S3Endpoint,
		"bucket", cfg.S3Bucket,
		"region", cfg.S3Region,
		"public_base", cfg.S3PublicBaseURL,
		"configured", s3Storage.IsConfigured(),
		"legacy_supabase", legacyStorage.IsConfigured(),
	)
	broker := events.NewBroker()
	rajaOngkir := rajaongkir.New(cfg.RajaOngkirAPIKey, cfg.RajaOngkirTier)
	auditLogger := audit.New(auditRepo, users, logger)
	mailer := email.NewMailer(cfg.MailtrapAPIKey, cfg.FromEmail, cfg.FromName, logger)
	twilioClient := notify.NewTwilio(cfg.TwilioAccountSID, cfg.TwilioAuthToken, cfg.TwilioWhatsAppFrom, logger)
	// PrimaryWebOrigin: single canonical URL untuk link email/notif.
	// WebOrigin (raw, comma-separated) tetap dipakai oleh CORS middleware.
	publicWebURL := cfg.PrimaryWebOrigin()
	fulfiller := fulfillment.New(orders, stores, downloadTokens, mailer, publicWebURL, logger)
	// Meta (Facebook) Conversions API — server-side Purchase events at the paid
	// chokepoint. No-op per store until the seller enables Meta in settings.
	metaClient := meta.NewClient(logger)
	metaNotifier := meta.NewNotifier(stores, orders, subscriptions, encryptor, metaClient, publicWebURL, logger)

	authHandler := handler.NewAuthHandler(users, emailVerifications, memberships, googleVerifier, jwtSvc, mailer, publicWebURL, logger, cfg.IsProd())
	storeHandler := handler.NewStoreHandler(stores, subscriptions, auditLogger, logger)
	metaHandler := handler.NewMetaHandler(stores, encryptor, cfg.WebhookBaseURL, auditLogger, logger)
	productHandler := handler.NewProductHandler(products, variants, stores, subscriptions, planRepo, bulkJobs, productDiscounts, modifierRepo, materialRepo, categories, courseVideos, storageClient, broker, auditLogger, logger)
	uploadHandler := handler.NewUploadHandler(stores, storageClient, logger)
	orderHandler := handler.NewOrderHandler(orders, stores, gateways, encryptor, midtransClient, auditLogger, fulfiller, metaNotifier, mailer, publicWebURL, logger)
	customerHandler := handler.NewCustomerHandler(customers, orders, stores, auditLogger, logger)
	materialHandler := handler.NewMaterialHandler(materialRepo, stores, subscriptions, auditLogger, logger)
	membershipHandler := handler.NewMembershipHandler(membershipTierRepo, stores, subscriptions, auditLogger, logger)
	purchasingHandler := handler.NewPurchasingHandler(supplierRepo, purchaseOrderRepo, stockTakeRepo, stores, subscriptions, auditLogger, logger)
	anthropicClient := ai.NewAnthropicClient(cfg.AnthropicAPIKey, logger)
	analyticsHandler := handler.NewAnalyticsHandler(analyticsRepo, cashEntryRepo, stores, subscriptions, reports, products, users, anthropicClient, mailer, publicWebURL, auditLogger, logger)
	tableHandler := handler.NewTableHandler(tableRepo, stores, subscriptions, auditLogger, logger)
	kdsHandler := handler.NewKDSHandler(kitchenRepo, stores, broker, logger)
	bannerHandler := handler.NewBannerHandler(bannerRepo, storageClient, logger)
	sellerBannerHandler := handler.NewSellerBannerHandler(sellerBannerRepo, stores, subscriptions, storageClient, logger)
	paymentHandler := handler.NewPaymentHandler(gateways, stores, encryptor, midtransClient, auditLogger, logger, cfg.WebhookBaseURL)
	dashHandler := handler.NewDashboardHandler(stores, products, orders, customers, logger)
	storefrontHandler := handler.NewStorefrontHandler(
		stores, products, variants, orders, bankAccounts, categories, promos, gateways,
		encryptor, midtransClient,
		subscriptions, planRepo, users, waTemplates, modifierRepo, tableRepo, broker, rajaOngkir, mailer, twilioClient,
		storageClient, auditLogger, publicWebURL, cfg.OrderExpiryHours, logger,
	)
	orderStreamHandler := handler.NewOrderStreamHandler(stores, broker, logger)
	citiesHandler := handler.NewCitiesHandler(rajaOngkir, logger)
	filesHandler := handler.NewFilesHandler(storageClient, logger)
	waTemplateHandler := handler.NewWATemplateHandler(waTemplates, stores, auditLogger, logger)
	webhookHandler := handler.NewWebhookHandler(gateways, orders, stores, users, encryptor, mailer, fulfiller, metaNotifier, publicWebURL, logger)
	bankAccountHandler := handler.NewBankAccountHandler(bankAccounts, stores, auditLogger, logger)
	categoryHandler := handler.NewCategoryHandler(categories, stores, auditLogger, logger)
	promoHandler := handler.NewPromoHandler(promos, stores, subscriptions, planRepo, auditLogger, logger)
	reportsHandler := handler.NewReportsHandler(stores, reports, orders, subscriptions, anthropicClient, logger)
	subscriptionHandler := handler.NewSubscriptionHandler(
		subscriptions, stores, products, orders, users, planRepo,
		midtransClient, cfg.PlatformMidtransServerKey,
		auditLogger, logger,
	)
	plansHandler := handler.NewPlansHandler(planRepo, logger)
	adminPlansHandler := handler.NewAdminPlansHandler(planRepo, platformAuditRepo, users, logger)
	downloadHandler := handler.NewDownloadHandler(downloadTokens, downloadLogs, logger)
	digitalDownloadHandler := handler.NewDigitalDownloadHandler(downloadTokens, downloadLogs, stores, logger)
	buyerOTPs := repository.NewBuyerOTPRepo(pool)
	buyerCourseHandler := handler.NewBuyerCourseHandler(downloadTokens, buyerOTPs, courseVideos, downloadLogs, mailer, jwtSvc, cfg.IsProd(), logger)
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

	requireAuth := middleware.RequireAuth(jwtSvc, users)
	requireBuyer := middleware.RequireBuyer(jwtSvc)

	// Per-IP fixed-window limiters for the unauthenticated surfaces. Without
	// these, /auth/login is an unthrottled bcrypt oracle, the OTP endpoints
	// are brute-forceable, and anonymous checkout can exhaust a store's
	// monthly order quota (or its Twilio credit) in seconds.
	limitAuth := middleware.RateLimit(15, time.Minute)
	limitOTP := middleware.RateLimit(20, time.Minute)
	limitCheckout := middleware.RateLimit(30, time.Minute)

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
		// Read-proxy for uploaded assets. Public by necessity: the bucket is
		// private and a storefront visitor has no session, so this is what
		// makes product photos loadable at all. Keys carry 8 random bytes and
		// the bucket exposes no listing, so URLs can't be guessed.
		r.Get("/files/*", filesHandler.Serve)
		// Pricing — public so the landing page can fetch without auth.
		r.Get("/plans", plansHandler.ListPublic)
		// Digital-download access is now email-OTP gated (like courses) so the
		// link can't simply be shared + every access is tracked. Public: request
		// + verify OTP; the delivery info itself sits behind RequireBuyer.
		r.With(limitOTP).Post("/download/{token}/request-otp", buyerCourseHandler.RequestOTP)
		r.With(limitOTP).Post("/download/{token}/verify-otp", buyerCourseHandler.VerifyOTP)
		r.Group(func(r chi.Router) {
			r.Use(requireBuyer)
			r.Get("/download/{token}", downloadHandler.Get)
		})
		// City autocomplete — public so both buyer checkout and seller
		// settings can reach it.
		r.Get("/cities/search", citiesHandler.Search)

		// Public domain → slug resolution for Next.js middleware.
		// Must be registered BEFORE /storefront/{slug} so chi resolves
		// the static segment "domain-lookup" before the wildcard {slug}.
		r.Get("/storefront/domain-lookup", storefrontHandler.DomainLookup)

		// Public Caddy on_demand_tls "ask" endpoint — returns 200 only for an
		// active custom domain so Caddy will obtain a cert for it.
		r.Get("/internal/tls-check", storefrontHandler.TLSCheck)

		// Public table QR resolution (scan a table → store + table).
		r.Get("/tables/resolve/{token}", tableHandler.Resolve)

		// Public storefront (no auth)
		r.Route("/storefront/{slug}", func(r chi.Router) {
			r.Get("/", storefrontHandler.GetStore)
			r.Get("/banners", sellerBannerHandler.PublicList)
			// Meta catalog feed (Facebook Commerce Manager crawls this).
			r.Get("/meta-feed.xml", storefrontHandler.MetaFeed)
			r.Get("/products/{productSlug}", storefrontHandler.GetProduct)
			r.With(limitCheckout).Post("/orders", storefrontHandler.CreateOrder)
			r.With(limitCheckout).Get("/orders/{number}", storefrontHandler.GetOrder)
			r.With(limitCheckout).Post("/orders/{number}/payment-link", storefrontHandler.GeneratePaymentLink)
			r.With(limitCheckout).Post("/orders/{number}/mark-paid", storefrontHandler.MarkPaymentPending)
			r.With(limitCheckout).Post("/orders/{number}/payment-proof", storefrontHandler.UploadPaymentProof)
			r.Post("/shipping/quote", storefrontHandler.ShippingQuote)
			r.Post("/promos/validate", storefrontHandler.ValidatePromo)
			r.Get("/queue", kdsHandler.PublicQueue)
			// Course viewer: public OTP request/verify, then RequireBuyer-gated
			// content (which also records the access into download_logs).
			r.With(limitOTP).Post("/course/{token}/request-otp", buyerCourseHandler.RequestOTP)
			r.With(limitOTP).Post("/course/{token}/verify-otp", buyerCourseHandler.VerifyOTP)
			r.Group(func(r chi.Router) {
				r.Use(requireBuyer)
				r.Get("/course/{token}/content", buyerCourseHandler.Content)
			})
		})

		r.Route("/auth", func(r chi.Router) {
			r.Group(func(r chi.Router) {
				r.Use(limitAuth)
				r.Post("/google", authHandler.Google)
				r.Post("/register", authHandler.Register)
				r.Post("/login", authHandler.Login)
				r.Post("/verify-email", authHandler.VerifyEmail)
				r.Post("/resend-verification", authHandler.ResendVerification)
				r.Post("/forgot-password", authHandler.ForgotPassword)
				r.Post("/reset-password", authHandler.ResetPassword)
			})
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

				// feat gates a route (group) behind a Bisnis-tier feature.
				feat := func(f feature.Feature) func(http.Handler) http.Handler {
					return middleware.RequireFeature(f, stores, subscriptions)
				}

				r.Get("/dashboard/stats", dashHandler.Stats)

				// Platform promo/info banners for the dashboard slider (read-only
				// for sellers; admins manage them under /admin/banners).
				r.Get("/banners", bannerHandler.ListActive)

				r.Route("/store", func(r chi.Router) {
					r.Get("/", storeHandler.Get)
					r.Post("/", storeHandler.Create)
					r.Put("/", storeHandler.Update)
					r.Put("/shipping", storeHandler.UpdateShipping)
					r.Put("/tax", storeHandler.UpdateTax)
					r.Put("/offline", storeHandler.UpdateOffline)
					r.Put("/profiling", storeHandler.UpdateProfiling)
					r.Put("/menu-caps", storeHandler.UpdateMenuCaps)
					r.Put("/storefront", storeHandler.UpdateStorefront)
					r.With(feat(feature.CheckoutFields)).Put("/checkout-config", storeHandler.UpdateCheckoutConfig)
					r.Put("/custom-domain", domainHandler.Set)
					r.Post("/custom-domain/verify", domainHandler.Verify)
					r.Delete("/custom-domain", domainHandler.Delete)
					r.Get("/dinein", tableHandler.GetDineIn) // read-only: open so the dashboard can read kds_enabled
					r.With(feat(feature.TableQR)).Put("/dinein", tableHandler.UpdateDineIn)

					// Seller-owned promo banners (storefront / table_order / queue).
					r.Route("/banners", func(r chi.Router) {
						r.Get("/", sellerBannerHandler.List)
						r.Post("/", sellerBannerHandler.Create)
						r.Put("/{id}", sellerBannerHandler.Update)
						r.Delete("/{id}", sellerBannerHandler.Delete)
					})

					// Meta (Facebook) integration config. GET open so the settings
					// page can render the upsell/state; PUT gated to Bisnis.
					r.Get("/meta", metaHandler.Get)
					r.With(feat(feature.MetaIntegration)).Put("/meta", metaHandler.Save)
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
					r.Use(feat(feature.Membership))
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
				// Financial analytics + AI summary are Bisnis-only. The sales
				// summary (reports/overview) stays open to all tiers.
				r.With(feat(feature.AIAnalytics)).Get("/analytics/overview", analyticsHandler.Overview)
				r.With(feat(feature.AIAnalytics)).Post("/analytics/ai-summary", analyticsHandler.AiSummary)
				r.With(feat(feature.AIAnalytics)).Get("/analytics/ai-summary/stream", analyticsHandler.AiSummaryStream)
				r.Route("/cash-entries", func(r chi.Router) {
					r.Use(feat(feature.AIAnalytics))
					r.Get("/", analyticsHandler.ListCashEntries)
					r.Post("/", analyticsHandler.CreateCashEntry)
					r.Delete("/{id}", analyticsHandler.DeleteCashEntry)
				})
				r.Route("/tables", func(r chi.Router) {
					r.Use(feat(feature.TableQR))
					r.Get("/", tableHandler.List)
					r.Post("/", tableHandler.Create)
					r.Put("/{id}", tableHandler.Update)
					r.Delete("/{id}", tableHandler.Delete)
				})
				r.Route("/kds", func(r chi.Router) {
					r.Use(feat(feature.TableQR))
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
					r.Get("/{id}/movement-series", materialHandler.MovementSeries)
					r.Get("/{id}", materialHandler.Get)
				})

				r.Post("/uploads/image", uploadHandler.Image)
				// Digital deliverables (pdf/zip/epub/audio/video): no image
				// compression, larger cap, sniffed-type allowlist.
				r.Post("/uploads/file", uploadHandler.File)
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
					// Digital download history for this customer (audit card).
					r.Get("/{id}/downloads", digitalDownloadHandler.ByCustomer)
					// Member codes are part of the membership program (Bisnis-only).
					r.With(feat(feature.Membership)).Post("/{id}/member-code", customerHandler.GenerateMemberCode)
				})

				// Digital download audit (all tiers). Lists each download link
				// with usage + share signal; per-link revoke for leaked links.
				r.Route("/digital-downloads", func(r chi.Router) {
					r.Get("/", digitalDownloadHandler.List)
					r.Get("/{tokenId}/logs", digitalDownloadHandler.Logs)
					r.Post("/{tokenId}/revoke", digitalDownloadHandler.Revoke)
					r.Post("/{tokenId}/unrevoke", digitalDownloadHandler.Unrevoke)
				})

				r.Route("/payments/midtrans", func(r chi.Router) {
					r.Get("/", paymentHandler.Get)
					r.Put("/", paymentHandler.Save)
					r.Post("/connect", paymentHandler.Connect)
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
					// Whole POS suite (incl. printer + loyalty config under /pos)
					// is Bisnis-only.
					r.Use(feat(feature.POS))
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
					r.Get("/orders", posHandler.ListPOSOrders)
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
