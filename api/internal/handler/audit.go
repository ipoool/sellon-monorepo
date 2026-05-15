package handler

import (
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type AuditHandler struct {
	repo   *repository.AuditRepo
	stores *repository.StoreRepo
	users  *repository.UserRepo
	logger *slog.Logger
}

func NewAuditHandler(repo *repository.AuditRepo, stores *repository.StoreRepo, users *repository.UserRepo, logger *slog.Logger) *AuditHandler {
	return &AuditHandler{repo: repo, stores: stores, users: users, logger: logger}
}

type auditEntryDTO struct {
	ID                 string         `json:"id"`
	ActorUserID        string         `json:"actor_user_id"`
	ActorEmail         string         `json:"actor_email"`
	ActorName          string         `json:"actor_name"`
	ImpersonatorUserID string         `json:"impersonator_user_id,omitempty"`
	ImpersonatorEmail  string         `json:"impersonator_email,omitempty"`
	ImpersonatorName   string         `json:"impersonator_name,omitempty"`
	Action             string         `json:"action"`
	EntityType         string         `json:"entity_type"`
	EntityID           string         `json:"entity_id"`
	Summary            string         `json:"summary"`
	Metadata           map[string]any `json:"metadata"`
	CreatedAt          string         `json:"created_at"`
}

// GET /api/v1/audit-log?action=&limit=&before=
//
// `before` is an ISO timestamp returned from the previous page's last
// entry, used to paginate further back. Limit defaults to 50, max 200.
func (h *AuditHandler) List(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserIDFromContext(r.Context())
	store, err := h.stores.FindByOwnerID(r.Context(), uid)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}

	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))

	parseTime := func(key string) *time.Time {
		s := q.Get(key)
		if s == "" {
			return nil
		}
		// Try RFC3339 (e.g. "2026-05-10T00:00:00Z") first, then a plain
		// date (YYYY-MM-DD) which the date input emits.
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			return &t
		}
		if t, err := time.Parse("2006-01-02", s); err == nil {
			return &t
		}
		return nil
	}

	filter := repository.AuditListFilter{
		Action: q.Get("action"),
		Limit:  limit,
		Before: parseTime("before"),
		Since:  parseTime("since"),
	}
	// `until` from a date input is a midnight timestamp. To make the
	// filter inclusive of the whole day, push it to end-of-day.
	if u := parseTime("until"); u != nil {
		end := u.Add(24*time.Hour - time.Nanosecond)
		filter.Until = &end
	}

	entries, err := h.repo.List(r.Context(), store.ID, filter)
	if err != nil {
		h.logger.Error("audit list", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal memuat aktivitas")
		return
	}

	// Resolve impersonator emails in a single batch — usually it's
	// just one or two admin IDs even across many entries, so a tiny
	// per-id cache is plenty.
	impCache := map[uuid.UUID]struct{ email, name string }{}

	out := make([]auditEntryDTO, 0, len(entries))
	for _, e := range entries {
		dto := auditEntryDTO{
			ID:         e.ID.String(),
			ActorEmail: e.ActorEmail,
			ActorName:  e.ActorName,
			Action:     e.Action,
			EntityType: e.EntityType,
			EntityID:   e.EntityID,
			Summary:    e.Summary,
			Metadata:   e.Metadata,
			CreatedAt:  e.CreatedAt.Format(time.RFC3339),
		}
		if e.ActorUserID != nil {
			dto.ActorUserID = e.ActorUserID.String()
		}
		if e.ImpersonatorUserID != nil {
			dto.ImpersonatorUserID = e.ImpersonatorUserID.String()
			cached, ok := impCache[*e.ImpersonatorUserID]
			if !ok {
				if u, err := h.users.FindByID(r.Context(), *e.ImpersonatorUserID); err == nil && u != nil {
					cached = struct{ email, name string }{u.Email, u.Name}
				}
				impCache[*e.ImpersonatorUserID] = cached
			}
			dto.ImpersonatorEmail = cached.email
			dto.ImpersonatorName = cached.name
		}
		out = append(out, dto)
	}

	response.JSON(w, http.StatusOK, map[string]any{"entries": out})
}
