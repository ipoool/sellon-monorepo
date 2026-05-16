package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
	"github.com/sellon/sellon/api/internal/storage"
)

type AdminHandler struct {
	users         *repository.UserRepo
	stores        *repository.StoreRepo
	admin         *repository.AdminRepo
	platformAudit *repository.PlatformAuditRepo
	auditRepo     *repository.AuditRepo
	subs          *repository.SubscriptionRepo
	storage       *storage.SupabaseClient
	jwt           *auth.JWTService
	cookieSecure  bool
	logger        *slog.Logger
}

func NewAdminHandler(
	users *repository.UserRepo,
	stores *repository.StoreRepo,
	admin *repository.AdminRepo,
	platformAudit *repository.PlatformAuditRepo,
	auditRepo *repository.AuditRepo,
	subs *repository.SubscriptionRepo,
	storageCli *storage.SupabaseClient,
	jwt *auth.JWTService,
	cookieSecure bool,
	logger *slog.Logger,
) *AdminHandler {
	return &AdminHandler{
		users: users, stores: stores, admin: admin,
		platformAudit: platformAudit, auditRepo: auditRepo, subs: subs,
		storage: storageCli,
		jwt:     jwt, cookieSecure: cookieSecure, logger: logger,
	}
}

// === Stats ===

// GET /api/v1/admin/stats
func (h *AdminHandler) Stats(w http.ResponseWriter, r *http.Request) {
	s, err := h.admin.Stats(r.Context())
	if err != nil {
		h.logger.Error("admin stats", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{
		"stats": map[string]any{
			"total_users":         s.TotalUsers,
			"banned_users":        s.BannedUsers,
			"total_stores":        s.TotalStores,
			"open_stores":         s.OpenStores,
			"total_products":      s.TotalProducts,
			"total_orders":        s.TotalOrders,
			"orders_this_month":   s.OrdersThisMonth,
			"revenue_all_cents":   s.RevenueAllCents,
			"revenue_month_cents": s.RevenueMonthCents,
			"paid_subs_count":     s.PaidSubsCount,
		},
	})
}

// === Users ===

type adminUserDTO struct {
	ID         string  `json:"id"`
	Email      string  `json:"email"`
	Name       string  `json:"name"`
	PictureURL string  `json:"picture_url"`
	Role       string  `json:"role"`
	BannedAt   string  `json:"banned_at,omitempty"`
	CreatedAt  string  `json:"created_at"`
	StoreID    *string `json:"store_id,omitempty"`
	Plan       string  `json:"plan"`
	SubStatus  string  `json:"sub_status"`
	PeriodEnd  *string `json:"period_end,omitempty"`
}

func toAdminUserDTO(u repository.User) adminUserDTO {
	out := adminUserDTO{
		ID: u.ID.String(), Email: u.Email, Name: u.Name,
		PictureURL: u.PictureURL, Role: u.Role,
		Plan: "free", SubStatus: "active",
		CreatedAt: u.CreatedAt.Format(time.RFC3339),
	}
	if u.BannedAt != nil {
		out.BannedAt = u.BannedAt.Format(time.RFC3339)
	}
	return out
}

func toAdminUserRowDTO(u repository.AdminUserRow) adminUserDTO {
	out := adminUserDTO{
		ID: u.ID.String(), Email: u.Email, Name: u.Name,
		PictureURL: u.PictureURL, Role: u.Role,
		Plan: u.Plan, SubStatus: u.SubStatus,
		CreatedAt: u.CreatedAt.Format(time.RFC3339),
	}
	if u.BannedAt != nil {
		out.BannedAt = u.BannedAt.Format(time.RFC3339)
	}
	if u.StoreID != nil {
		s := u.StoreID.String()
		out.StoreID = &s
	}
	if u.PeriodEnd != nil {
		v := u.PeriodEnd.Format(time.RFC3339)
		out.PeriodEnd = &v
	}
	return out
}

// GET /api/v1/admin/users?q=&limit=&before=
func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))

	var before *time.Time
	if s := q.Get("before"); s != "" {
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			before = &t
		}
	}

	users, err := h.admin.ListUsers(r.Context(), q.Get("q"), limit, before)
	if err != nil {
		h.logger.Error("admin list users", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]adminUserDTO, 0, len(users))
	for _, u := range users {
		out = append(out, toAdminUserRowDTO(u))
	}
	response.JSON(w, http.StatusOK, map[string]any{"users": out})
}

// GET /api/v1/admin/users/{id}
//
// Returns the user, the stores they own (with summary stats), and the
// recent platform-audit entries targeting them. Admin's one-stop view
// for "who is this person and what's been happening".
func (h *AdminHandler) GetUser(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	user, err := h.users.FindByID(r.Context(), id)
	if errors.Is(err, repository.ErrUserNotFound) {
		response.Error(w, http.StatusNotFound, "user tidak ditemukan")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	stores, err := h.admin.StoresOwnedBy(r.Context(), id)
	if err != nil {
		h.logger.Error("admin get user stores", "err", err)
	}

	platform, err := h.platformAudit.ListByTargetUser(r.Context(), id, 50)
	if err != nil {
		h.logger.Error("admin get user platform audit", "err", err)
	}

	storeOut := make([]storeSummaryDTO, 0, len(stores))
	for _, s := range stores {
		storeOut = append(storeOut, toStoreSummaryDTO(s))
	}
	auditOut := make([]platformAuditDTO, 0, len(platform))
	for _, e := range platform {
		auditOut = append(auditOut, toPlatformAuditDTO(e))
	}

	response.JSON(w, http.StatusOK, map[string]any{
		"user":           toAdminUserDTO(*user),
		"stores":         storeOut,
		"platform_audit": auditOut,
	})
}

// POST /api/v1/admin/users/{id}/ban
func (h *AdminHandler) BanUser(w http.ResponseWriter, r *http.Request) {
	h.toggleBan(w, r, true)
}

// POST /api/v1/admin/users/{id}/unban
func (h *AdminHandler) UnbanUser(w http.ResponseWriter, r *http.Request) {
	h.toggleBan(w, r, false)
}

func (h *AdminHandler) toggleBan(w http.ResponseWriter, r *http.Request, banned bool) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}

	// Prevent self-ban — keeps a single admin from accidentally locking
	// themselves out of the platform.
	actorUID, _ := auth.UserIDFromContext(r.Context())
	if actorUID == id && banned {
		response.Error(w, http.StatusBadRequest, "tidak bisa ban akun sendiri")
		return
	}

	user, err := h.users.SetBanned(r.Context(), id, banned)
	if err != nil {
		h.logger.Error("admin set banned", "err", err, "id", id)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	action := "user.unbanned"
	summary := "Buka blokir " + user.Email
	if banned {
		action = "user.banned"
		summary = "Blokir " + user.Email
	}
	h.logPlatform(r, action, &user.ID, nil, summary, map[string]any{
		"target_email": user.Email,
		"target_name":  user.Name,
	})

	response.JSON(w, http.StatusOK, map[string]any{"user": toAdminUserDTO(*user)})
}

// DELETE /api/v1/admin/users/{id}
//
// Hard-delete user beserta seluruh data terkait. FE wajib show
// ConfirmDialog dengan typed phrase "DELETE NOW" — backend hanya guard:
//   1) bukan diri sendiri
//   2) bukan akun admin lain (admin baru bisa di-delete via DB direct)
//
// Cascade DB sudah set di migration 0002+: stores → products, orders,
// categories, bank_accounts, promos, dst. semua ON DELETE CASCADE
// lewat owner_id. Gambar di Supabase Storage dibersihkan secara
// fire-and-forget setelah DB commit; file orphan tidak block UX.
func (h *AdminHandler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	actorUID, _ := auth.UserIDFromContext(r.Context())
	if actorUID == id {
		response.Error(w, http.StatusBadRequest, "tidak bisa hapus akun sendiri")
		return
	}

	target, err := h.users.FindByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			response.Error(w, http.StatusNotFound, "user tidak ditemukan")
			return
		}
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if target.Role == "admin" {
		response.Error(w, http.StatusForbidden,
			"akun admin tidak bisa di-delete lewat dasbor — minta tim ops untuk hapus via DB")
		return
	}

	// Snapshot info untuk audit BEFORE delete (row akan hilang).
	targetEmail := target.Email
	targetName := target.Name

	// Snapshot semua URL gambar yang dimiliki user agar bisa cleanup
	// dari Supabase Storage setelah cascade delete jalan.
	var paths []string
	if h.storage != nil && h.storage.IsConfigured() {
		urls, err := h.users.CollectStorageURLs(r.Context(), id)
		if err != nil {
			h.logger.Warn("admin delete user: collect storage urls",
				"err", err, "user_id", id)
			// non-fatal — lanjut delete user meski cleanup gagal kumpulin
		}
		for _, u := range urls {
			if p := h.storage.PathFromPublicURL(u); p != "" {
				paths = append(paths, p)
			}
		}
	}

	// Cascade DB delete. Postgres handle seluruh tabel terkait via FK.
	if err := h.users.HardDelete(r.Context(), id); err != nil {
		h.logger.Error("admin hard delete user", "err", err, "user_id", id)
		response.Error(w, http.StatusInternalServerError, "gagal hapus user")
		return
	}

	// Storage cleanup async — request user sudah bisa balik 200.
	if len(paths) > 0 && h.storage != nil && h.storage.IsConfigured() {
		go func(p []string) {
			ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
			defer cancel()
			if err := h.storage.DeleteObjects(ctx, p); err != nil {
				h.logger.Warn("admin delete user: storage cleanup",
					"err", err, "count", len(p), "user_id", id)
			}
		}(paths)
	}

	h.logPlatform(r, "user.deleted", nil, nil,
		"Hard delete user "+targetEmail,
		map[string]any{
			"target_user_id":       id.String(),
			"target_email":         targetEmail,
			"target_name":          targetName,
			"storage_paths_purged": len(paths),
		})

	response.JSON(w, http.StatusOK, map[string]any{
		"ok":               true,
		"deleted_user_id":  id.String(),
		"storage_cleanup":  len(paths),
	})
}

// === Impersonation ===

// POST /api/v1/admin/users/{id}/impersonate
//
// Re-issues the session cookie for `target` while encoding the calling
// admin into the imp claim. The impersonation token uses the same TTL
// as a regular session (JWT_TTL_HOURS) — exit happens via the explicit
// "Keluar dari mode" button rather than a forced auto-expire.
func (h *AdminHandler) Impersonate(w http.ResponseWriter, r *http.Request) {
	targetID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	target, err := h.users.FindByID(r.Context(), targetID)
	if errors.Is(err, repository.ErrUserNotFound) {
		response.Error(w, http.StatusNotFound, "user tidak ditemukan")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if target.IsBanned() {
		response.Error(w, http.StatusBadRequest, "user diblokir — buka blokir dulu")
		return
	}
	adminUID, _ := auth.UserIDFromContext(r.Context())
	if adminUID == targetID {
		response.Error(w, http.StatusBadRequest, "tidak perlu impersonate diri sendiri")
		return
	}

	// ttl=0 → IssueImpersonation falls back to the service's default TTL
	// (same as a normal seller session).
	token, exp, err := h.jwt.IssueImpersonation(targetID, &adminUID, 0)
	if err != nil {
		h.logger.Error("issue impersonation jwt", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     auth.SessionCookieName,
		Value:    token,
		Path:     "/",
		Expires:  exp,
		MaxAge:   int(time.Until(exp).Seconds()),
		HttpOnly: true,
		Secure:   h.cookieSecure,
		SameSite: http.SameSiteLaxMode,
	})

	h.logPlatform(r, "user.impersonate_started",
		&target.ID, nil,
		"Mulai impersonate "+target.Email,
		map[string]any{
			"target_email": target.Email,
			"target_name":  target.Name,
		})

	response.JSON(w, http.StatusOK, map[string]any{
		"ok":         true,
		"expires_at": exp.Format(time.RFC3339),
		"target": map[string]any{
			"id":    target.ID.String(),
			"email": target.Email,
			"name":  target.Name,
		},
	})
}

// POST /api/v1/auth/exit-impersonation
//
// Restores the admin's own session by re-issuing a normal JWT for the
// user ID stored in the imp claim. Safety gates:
//
//   - The imp claim was server-set + JWT-signed during /impersonate, so
//     the impID we read here can't be forged client-side.
//   - We re-verify the user still exists, has role='admin', and isn't
//     banned. If any check fails (admin revoked, account banned), we
//     fall back to clearing the cookie entirely so the caller has to
//     log in fresh.
func (h *AdminHandler) ExitImpersonation(w http.ResponseWriter, r *http.Request) {
	impID, ok := auth.ImpersonatorIDFromContext(r.Context())
	if !ok {
		response.Error(w, http.StatusBadRequest, "tidak sedang impersonate")
		return
	}

	// Audit before mutating cookie — context still has both impersonator
	// and target uid available. Best-effort; ignore lookup errors.
	admin, _ := h.users.FindByID(r.Context(), impID)
	if targetID, ok := auth.UserIDFromContext(r.Context()); ok {
		target, _ := h.users.FindByID(r.Context(), targetID)
		summary := "Selesai impersonate"
		if target != nil {
			summary = "Selesai impersonate " + target.Email
		}
		in := repository.PlatformAuditInput{
			Action:       "user.impersonate_ended",
			TargetUserID: &targetID,
			Summary:      summary,
		}
		if admin != nil {
			in.ActorUserID = &admin.ID
			in.ActorEmail = admin.Email
			in.ActorName = admin.Name
		}
		_ = h.platformAudit.Log(r.Context(), in)
	}

	// If the original admin is gone / no longer admin / banned, fall
	// back to clearing the cookie. The caller will land on /login.
	if admin == nil || admin.Role != "admin" || admin.IsBanned() {
		http.SetCookie(w, &http.Cookie{
			Name:     auth.SessionCookieName,
			Value:    "",
			Path:     "/",
			MaxAge:   -1,
			HttpOnly: true,
			Secure:   h.cookieSecure,
			SameSite: http.SameSiteLaxMode,
		})
		response.JSON(w, http.StatusOK, map[string]any{
			"ok":         true,
			"logged_out": true,
		})
		return
	}

	// Re-issue a normal (non-impersonation) session for the admin.
	token, exp, err := h.jwt.Issue(admin.ID)
	if err != nil {
		h.logger.Error("issue admin jwt on exit-impersonation", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     auth.SessionCookieName,
		Value:    token,
		Path:     "/",
		Expires:  exp,
		MaxAge:   int(time.Until(exp).Seconds()),
		HttpOnly: true,
		Secure:   h.cookieSecure,
		SameSite: http.SameSiteLaxMode,
	})

	response.JSON(w, http.StatusOK, map[string]any{
		"ok":         true,
		"restored":   true,
		"expires_at": exp.Format(time.RFC3339),
	})
}

// === Stores ===

type storeSummaryDTO struct {
	ID            string  `json:"id"`
	Slug          string  `json:"slug"`
	Name          string  `json:"name"`
	OwnerUserID   string  `json:"owner_user_id"`
	OwnerEmail    string  `json:"owner_email"`
	OwnerName     string  `json:"owner_name"`
	IsOpen        bool    `json:"is_open"`
	Plan          string  `json:"plan"`
	SubStatus     string  `json:"sub_status"`
	PeriodEnd     *string `json:"period_end"`
	ProductsCount int     `json:"products_count"`
	OrdersCount   int     `json:"orders_count"`
	RevenueCents  int64   `json:"revenue_cents"`
	CreatedAt     string  `json:"created_at"`
}

func toStoreSummaryDTO(s repository.StoreSummary) storeSummaryDTO {
	var periodEnd *string
	if s.PeriodEnd != nil {
		v := s.PeriodEnd.Format(time.RFC3339)
		periodEnd = &v
	}
	return storeSummaryDTO{
		ID: s.ID.String(), Slug: s.Slug, Name: s.Name,
		OwnerUserID: s.OwnerUserID.String(),
		OwnerEmail:  s.OwnerEmail, OwnerName: s.OwnerName,
		IsOpen: s.IsOpen, Plan: s.Plan, SubStatus: s.SubStatus,
		PeriodEnd:     periodEnd,
		ProductsCount: s.ProductsCount, OrdersCount: s.OrdersCount,
		RevenueCents: s.RevenueCents,
		CreatedAt:    s.CreatedAt.Format(time.RFC3339),
	}
}

// GET /api/v1/admin/stores?q=&limit=
func (h *AdminHandler) ListStores(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	stores, err := h.admin.ListStoresWithStats(r.Context(), q.Get("q"), limit)
	if err != nil {
		h.logger.Error("admin list stores", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]storeSummaryDTO, 0, len(stores))
	for _, s := range stores {
		out = append(out, toStoreSummaryDTO(s))
	}
	response.JSON(w, http.StatusOK, map[string]any{"stores": out})
}

// === Per-target audit ===

type platformAuditDTO struct {
	ID                 string         `json:"id"`
	ActorUserID        string         `json:"actor_user_id"`
	ActorEmail         string         `json:"actor_email"`
	ActorName          string         `json:"actor_name"`
	ImpersonatorUserID string         `json:"impersonator_user_id,omitempty"`
	Action             string         `json:"action"`
	TargetUserID       string         `json:"target_user_id"`
	TargetStoreID      string         `json:"target_store_id"`
	Summary            string         `json:"summary"`
	Metadata           map[string]any `json:"metadata"`
	CreatedAt          string         `json:"created_at"`
}

func toPlatformAuditDTO(e repository.PlatformAuditEntry) platformAuditDTO {
	out := platformAuditDTO{
		ID: e.ID.String(),
		ActorEmail: e.ActorEmail, ActorName: e.ActorName,
		Action: e.Action, Summary: e.Summary,
		Metadata:  e.Metadata,
		CreatedAt: e.CreatedAt.Format(time.RFC3339),
	}
	if e.ActorUserID != nil {
		out.ActorUserID = e.ActorUserID.String()
	}
	if e.ImpersonatorUserID != nil {
		out.ImpersonatorUserID = e.ImpersonatorUserID.String()
	}
	if e.TargetUserID != nil {
		out.TargetUserID = e.TargetUserID.String()
	}
	if e.TargetStoreID != nil {
		out.TargetStoreID = e.TargetStoreID.String()
	}
	return out
}

// GET /api/v1/admin/users/{id}/audit
//
// Returns recent admin actions taken against this user (platform_audit_log).
// Per-store activity log is reachable via the existing /api/v1/audit-log
// when impersonating.
func (h *AdminHandler) UserAudit(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	entries, err := h.platformAudit.ListByTargetUser(r.Context(), id, 100)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]platformAuditDTO, 0, len(entries))
	for _, e := range entries {
		out = append(out, toPlatformAuditDTO(e))
	}
	response.JSON(w, http.StatusOK, map[string]any{"entries": out})
}

// === Helpers ===

// logPlatform writes a platform_audit_log entry tagged with the calling
// admin (or the impersonator, if the admin is currently in a
// non-admin context — which RequireAdmin already prevents, but we
// defensively record it anyway).
func (h *AdminHandler) logPlatform(r *http.Request, action string, targetUser *uuid.UUID, targetStore *uuid.UUID, summary string, metadata map[string]any) {
	in := repository.PlatformAuditInput{
		Action:        action,
		TargetUserID:  targetUser,
		TargetStoreID: targetStore,
		Summary:       summary,
		Metadata:      metadata,
	}
	if uid, ok := auth.UserIDFromContext(r.Context()); ok {
		in.ActorUserID = &uid
		if u, err := h.users.FindByID(r.Context(), uid); err == nil {
			in.ActorEmail = u.Email
			in.ActorName = u.Name
		}
	}
	if impID, ok := auth.ImpersonatorIDFromContext(r.Context()); ok {
		in.ImpersonatorUserID = &impID
	}
	if err := h.platformAudit.Log(r.Context(), in); err != nil {
		h.logger.Error("platform audit insert", "err", err, "action", action)
	}
}

// minor helper to keep the imports unsurprising; reserved for future use.
var _ = strings.TrimSpace

// === Subscription transactions (admin-only) ===

type adminInvoiceDTO struct {
	ID              string  `json:"id"`
	StoreID         string  `json:"store_id"`
	StoreName       string  `json:"store_name"`
	StoreSlug       string  `json:"store_slug"`
	OwnerName       string  `json:"owner_name"`
	OwnerEmail      string  `json:"owner_email"`
	OwnerPicture    string  `json:"owner_picture"`
	Plan            string  `json:"plan"`
	Months          int     `json:"months"`
	AmountCents     int64   `json:"amount_cents"`
	Status          string  `json:"status"`
	Provider        string  `json:"provider"`
	ProviderOrderID string  `json:"provider_order_id"`
	Notes           string  `json:"notes"`
	PaidAt          *string `json:"paid_at"`
	PeriodStart     *string `json:"period_start"`
	PeriodEnd       *string `json:"period_end"`
	CreatedAt       string  `json:"created_at"`
}

func toAdminInvoiceDTO(row repository.AdminInvoiceRow) adminInvoiceDTO {
	formatT := func(t *time.Time) *string {
		if t == nil {
			return nil
		}
		s := t.Format(time.RFC3339)
		return &s
	}
	return adminInvoiceDTO{
		ID:              row.ID.String(),
		StoreID:         row.StoreID.String(),
		StoreName:       row.StoreName,
		StoreSlug:       row.StoreSlug,
		OwnerName:       row.OwnerName,
		OwnerEmail:      row.OwnerEmail,
		OwnerPicture:    row.OwnerPicture,
		Plan:            row.Plan,
		Months:          row.Months,
		AmountCents:     row.AmountCents,
		Status:          row.Status,
		Provider:        row.Provider,
		ProviderOrderID: row.ProviderOrderID,
		Notes:           row.Notes,
		PaidAt:          formatT(row.PaidAt),
		PeriodStart:     formatT(row.PeriodStart),
		PeriodEnd:       formatT(row.PeriodEnd),
		CreatedAt:       row.CreatedAt.Format(time.RFC3339),
	}
}

// GET /api/v1/admin/subscriptions/invoices?status=&q=&limit=&offset=
func (h *AdminHandler) ListInvoices(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit == 0 {
		limit = 25
	}
	offset, _ := strconv.Atoi(q.Get("offset"))

	rows, total, err := h.subs.AdminListInvoices(r.Context(), repository.AdminListInvoicesFilter{
		Status: strings.TrimSpace(q.Get("status")),
		Search: strings.TrimSpace(q.Get("q")),
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		h.logger.Error("admin list invoices", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	out := make([]adminInvoiceDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, toAdminInvoiceDTO(row))
	}
	response.JSON(w, http.StatusOK, map[string]any{
		"invoices": out,
		"total":    total,
	})
}

// POST /api/v1/admin/subscriptions/invoices/{id}/activate
//
// Used after admin verified the manual bank transfer arrived. SettleInvoice
// flips pending → paid AND extends the subscription period in one tx, so
// this is the single point of activation for manual flows.
func (h *AdminHandler) ActivateInvoice(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	sub, inv, err := h.subs.SettleInvoice(r.Context(), id)
	if err != nil {
		h.logger.Error("admin settle invoice", "err", err, "invoice_id", id)
		response.Error(w, http.StatusBadRequest,
			"gagal aktifkan transaksi - cek apakah invoice sudah pernah di-settle")
		return
	}
	storeID := inv.StoreID
	h.logPlatform(r, "subscription.invoice_activated", nil, &storeID,
		"Aktifkan transaksi langganan #"+id.String()[:8],
		map[string]any{
			"invoice_id":   inv.ID.String(),
			"store_id":     inv.StoreID.String(),
			"plan":         inv.Plan,
			"months":       inv.Months,
			"amount_cents": inv.AmountCents,
			"new_period":   sub.CurrentPeriodEnd,
		})
	response.JSON(w, http.StatusOK, map[string]any{
		"invoice": toAdminInvoiceDTO(repository.AdminInvoiceRow{
			SubscriptionInvoice: *inv,
		}),
		"subscription": sub,
	})
}

type grantSubscriptionReq struct {
	Plan      string `json:"plan"`       // "free" | "pro" | "bisnis"
	ExpiresAt string `json:"expires_at"` // RFC3339 or YYYY-MM-DD; ignored if plan="free"
	Months    int    `json:"months"`     // alternative to expires_at: now + months
}

// POST /api/v1/admin/stores/{storeID}/subscription
//
// Sets a store's plan + period_end directly, bypassing the payment flow.
// Used for trials given to colleagues so they can test Pro/Bisnis without
// faking an invoice. The grant is still recorded in subscription_invoices
// (provider='admin_grant', amount=0) for the audit trail.
func (h *AdminHandler) GrantSubscription(w http.ResponseWriter, r *http.Request) {
	storeID, err := uuid.Parse(chi.URLParam(r, "storeID"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid storeID")
		return
	}
	var req grantSubscriptionReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	plan := strings.ToLower(strings.TrimSpace(req.Plan))
	if plan != "free" && plan != "pro" && plan != "bisnis" {
		response.Error(w, http.StatusBadRequest,
			"plan harus salah satu: free, pro, bisnis")
		return
	}

	var expiresAt time.Time
	if plan != "free" {
		// Resolve expiry: explicit `expires_at` wins; otherwise derive
		// from `months`. Both missing → reject so we never accidentally
		// grant a perpetual paid plan.
		raw := strings.TrimSpace(req.ExpiresAt)
		switch {
		case raw != "":
			t, perr := parseAdminDateInput(raw)
			if perr != nil {
				response.Error(w, http.StatusBadRequest,
					"format expires_at tidak valid (pakai YYYY-MM-DD atau RFC3339)")
				return
			}
			expiresAt = t
		case req.Months > 0 && req.Months <= 60:
			expiresAt = time.Now().Add(
				time.Duration(req.Months) * 30 * 24 * time.Hour,
			)
		default:
			response.Error(w, http.StatusBadRequest,
				"isi expires_at atau months (1-60) untuk plan berbayar")
			return
		}
		if !expiresAt.After(time.Now()) {
			response.Error(w, http.StatusBadRequest,
				"expires_at harus di masa depan")
			return
		}
	}

	sub, err := h.subs.AdminGrantSubscription(r.Context(), storeID, plan, expiresAt)
	if err != nil {
		h.logger.Error("admin grant subscription", "err", err, "store_id", storeID)
		response.Error(w, http.StatusInternalServerError, "gagal set langganan")
		return
	}

	h.logPlatform(r, "subscription.admin_granted", nil, &storeID,
		"Admin set langganan "+plan,
		map[string]any{
			"store_id":   storeID.String(),
			"plan":       plan,
			"expires_at": expiresAt.Format(time.RFC3339),
		})

	response.JSON(w, http.StatusOK, map[string]any{
		"ok":           true,
		"subscription": sub,
	})
}

// parseAdminDateInput accepts "YYYY-MM-DD" (interpreted as end-of-day
// so trials don't expire mid-day) or RFC3339.
func parseAdminDateInput(raw string) (time.Time, error) {
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return t, nil
	}
	if t, err := time.Parse("2006-01-02", raw); err == nil {
		return t.Add(24 * time.Hour).Add(-time.Second), nil
	}
	return time.Time{}, errors.New("invalid date")
}

type rejectInvoiceReq struct {
	Notes string `json:"notes"`
}

// POST /api/v1/admin/subscriptions/invoices/{id}/reject
func (h *AdminHandler) RejectInvoice(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req rejectInvoiceReq
	_ = json.NewDecoder(r.Body).Decode(&req)
	if err := h.subs.AdminMarkInvoiceFailed(r.Context(), id, strings.TrimSpace(req.Notes)); err != nil {
		if errors.Is(err, repository.ErrInvoiceNotPending) {
			response.Error(w, http.StatusBadRequest, "transaksi sudah tidak pending")
			return
		}
		h.logger.Error("admin reject invoice", "err", err, "invoice_id", id)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.logPlatform(r, "subscription.invoice_rejected", nil, nil,
		"Tolak transaksi langganan #"+id.String()[:8],
		map[string]any{"invoice_id": id.String(), "notes": req.Notes})
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}
