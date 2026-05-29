package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/audit"
	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

// WIB is fixed +7 (Indonesia has no DST) — avoids a tzdata dependency in Go.
var wib = time.FixedZone("WIB", 7*3600)

type AnalyticsHandler struct {
	analytics *repository.AnalyticsRepo
	cash      *repository.CashEntryRepo
	stores    *repository.StoreRepo
	subs      *repository.SubscriptionRepo
	audit     *audit.Logger
	logger    *slog.Logger
}

func NewAnalyticsHandler(analytics *repository.AnalyticsRepo, cash *repository.CashEntryRepo, stores *repository.StoreRepo, subs *repository.SubscriptionRepo, audit *audit.Logger, logger *slog.Logger) *AnalyticsHandler {
	return &AnalyticsHandler{analytics: analytics, cash: cash, stores: stores, subs: subs, audit: audit, logger: logger}
}

func (h *AnalyticsHandler) requireStore(r *http.Request) (*repository.Store, error) {
	uid, _ := auth.UserIDFromContext(r.Context())
	return h.stores.FindByOwnerID(r.Context(), uid)
}

func (h *AnalyticsHandler) proBlocked(w http.ResponseWriter, r *http.Request, storeID uuid.UUID) bool {
	sub, err := h.subs.GetOrCreate(r.Context(), storeID)
	if err == nil && sub.Plan == "free" {
		response.JSON(w, http.StatusPaymentRequired, map[string]any{"error": "plan_required", "plan": "pro"})
		return true
	}
	return false
}

// dateWindow returns from (inclusive) + toExclusive (to + 1 day) as YYYY-MM-DD
// WIB strings, defaulting to the last 30 days.
func (h *AnalyticsHandler) dateWindow(r *http.Request) (string, string) {
	now := time.Now().In(wib)
	q := r.URL.Query()
	from := strings.TrimSpace(q.Get("from"))
	to := strings.TrimSpace(q.Get("to"))
	if from == "" {
		from = now.AddDate(0, 0, -29).Format("2006-01-02")
	}
	if to == "" {
		to = now.Format("2006-01-02")
	}
	toExcl := to
	if t, err := time.Parse("2006-01-02", to); err == nil {
		toExcl = t.AddDate(0, 0, 1).Format("2006-01-02")
	}
	return from, toExcl
}

// GET /api/v1/analytics/overview?from&to
func (h *AnalyticsHandler) Overview(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.JSON(w, http.StatusOK, map[string]any{"overview": nil, "has_store": false})
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if h.proBlocked(w, r, store.ID) {
		return
	}
	from, to := h.dateWindow(r)
	ov, err := h.analytics.Overview(r.Context(), store.ID, from, to)
	if err != nil {
		h.logger.Error("analytics overview", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"overview": ov, "has_store": true})
}

// GET /api/v1/cash-entries?from&to
func (h *AnalyticsHandler) ListCashEntries(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.JSON(w, http.StatusOK, map[string]any{"entries": []map[string]any{}})
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	from, to := h.dateWindow(r)
	rows, err := h.cash.ListByStore(r.Context(), store.ID, from, to)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]map[string]any, 0, len(rows))
	for _, c := range rows {
		out = append(out, map[string]any{
			"id": c.ID.String(), "direction": c.Direction, "category": c.Category,
			"amount_cents": c.AmountCents, "occurred_on": c.OccurredOn.Format("2006-01-02"),
			"note": c.Note,
		})
	}
	response.JSON(w, http.StatusOK, map[string]any{"entries": out})
}

// POST /api/v1/cash-entries
func (h *AnalyticsHandler) CreateCashEntry(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	if h.proBlocked(w, r, store.ID) {
		return
	}
	var in struct {
		Direction   string `json:"direction"`
		Category    string `json:"category"`
		AmountCents int64  `json:"amount_cents"`
		OccurredOn  string `json:"occurred_on"`
		Note        string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if in.Direction != "in" && in.Direction != "out" {
		response.Error(w, http.StatusBadRequest, "arah harus in/out")
		return
	}
	if in.AmountCents <= 0 {
		response.Error(w, http.StatusBadRequest, "nominal harus > 0")
		return
	}
	if _, perr := time.Parse("2006-01-02", in.OccurredOn); perr != nil {
		in.OccurredOn = time.Now().In(wib).Format("2006-01-02")
	}
	id, err := h.cash.Create(r.Context(), store.ID, in.Direction, strings.TrimSpace(in.Category), in.AmountCents, in.OccurredOn, strings.TrimSpace(in.Note))
	if err != nil {
		h.logger.Error("create cash entry", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal menyimpan")
		return
	}
	response.JSON(w, http.StatusCreated, map[string]any{"id": id.String()})
}

// DELETE /api/v1/cash-entries/{id}
func (h *AnalyticsHandler) DeleteCashEntry(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id invalid")
		return
	}
	if err := h.cash.Delete(r.Context(), store.ID, id); err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}
