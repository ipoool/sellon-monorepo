package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/audit"
	"github.com/sellon/sellon/api/internal/auth"
	email_pkg "github.com/sellon/sellon/api/internal/email"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type StaffHandler struct {
	stores      *repository.StoreRepo
	memberships *repository.MembershipRepo
	users       *repository.UserRepo
	subs        *repository.SubscriptionRepo
	plans       *repository.PlanRepo
	mailer      *email_pkg.Mailer
	webOrigin   string
	audit       *audit.Logger
	logger      *slog.Logger
}

func NewStaffHandler(
	stores *repository.StoreRepo,
	memberships *repository.MembershipRepo,
	users *repository.UserRepo,
	subs *repository.SubscriptionRepo,
	plans *repository.PlanRepo,
	mailer *email_pkg.Mailer,
	webOrigin string,
	audit *audit.Logger,
	logger *slog.Logger,
) *StaffHandler {
	return &StaffHandler{
		stores: stores, memberships: memberships, users: users,
		subs: subs, plans: plans,
		mailer: mailer, webOrigin: webOrigin,
		audit: audit, logger: logger,
	}
}

// subFor loads the active subscription (with snapshotted limits). Returns
// nil on lookup error so callers can fail-open.
func (h *StaffHandler) subFor(r *http.Request, storeID uuid.UUID) *repository.Subscription {
	sub, err := h.subs.GetOrCreate(r.Context(), storeID)
	if err != nil {
		return nil
	}
	return sub
}

type memberDTO struct {
	UserID    string `json:"user_id"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	Picture   string `json:"picture_url"`
	Role      string `json:"role"`
	JoinedAt  string `json:"joined_at"`
	IsCurrent bool   `json:"is_current"`
}

type inviteDTO2 struct {
	ID        string `json:"id"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	CreatedAt string `json:"created_at"`
}

func (h *StaffHandler) storeFor(r *http.Request) (*repository.Store, error) {
	uid, _ := auth.UserIDFromContext(r.Context())
	return h.stores.FindByOwnerID(r.Context(), uid)
}

// ownerGate ensures the caller is the owner of the store. Used for invite,
// remove, and role-change actions — staff can't escalate themselves.
func (h *StaffHandler) ownerGate(r *http.Request, storeID uuid.UUID) bool {
	uid, _ := auth.UserIDFromContext(r.Context())
	role, err := h.memberships.RoleFor(r.Context(), storeID, uid)
	if err != nil {
		return false
	}
	return role == repository.RoleOwner
}

// GET /api/v1/staff
func (h *StaffHandler) List(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	currentUID, _ := auth.UserIDFromContext(r.Context())

	members, err := h.memberships.ListByStore(r.Context(), store.ID)
	if err != nil {
		h.logger.Error("list members", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	invites, _ := h.memberships.ListInvitesByStore(r.Context(), store.ID)

	memberOut := make([]memberDTO, 0, len(members))
	for _, m := range members {
		memberOut = append(memberOut, memberDTO{
			UserID: m.UserID.String(), Email: m.UserEmail, Name: m.UserName,
			Picture: m.UserPicture, Role: string(m.Role),
			JoinedAt:  m.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
			IsCurrent: m.UserID == currentUID,
		})
	}
	inviteOut := make([]inviteDTO2, 0, len(invites))
	for _, inv := range invites {
		inviteOut = append(inviteOut, inviteDTO2{
			ID: inv.ID.String(), Email: inv.Email, Role: string(inv.Role),
			CreatedAt: inv.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		})
	}

	// Surface the staff cap so the frontend can show usage.
	limit := staffLimitForSub(h.subFor(r, store.ID))
	used := len(members) // owner counts toward the limit too
	response.JSON(w, http.StatusOK, map[string]any{
		"members":      memberOut,
		"invites":      inviteOut,
		"staff_limit":  limit,
		"members_used": used,
	})
}

type inviteReq struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

// POST /api/v1/staff/invite
func (h *StaffHandler) Invite(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	if !h.ownerGate(r, store.ID) {
		response.Error(w, http.StatusForbidden, "hanya pemilik toko yang bisa mengundang staf")
		return
	}
	var req inviteReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" {
		response.Error(w, http.StatusBadRequest, "email wajib diisi")
		return
	}
	role := strings.ToLower(strings.TrimSpace(req.Role))
	if role != "admin" && role != "staff" {
		role = "staff"
	}

	// Quota check. Snapshot lives on the subscription.
	sub := h.subFor(r, store.ID)
	limit := staffLimitForSub(sub)
	if limit > 0 {
		members, _ := h.memberships.ListByStore(r.Context(), store.ID)
		invites, _ := h.memberships.ListInvitesByStore(r.Context(), store.ID)
		if len(members)+len(invites) >= limit {
			planName := "free"
			if sub != nil {
				planName = sub.Plan
			}
			response.Error(w, http.StatusPaymentRequired,
				"Limit staf tier "+planName+" sudah tercapai. Upgrade untuk staf lebih banyak.")
			return
		}
	}

	uid, _ := auth.UserIDFromContext(r.Context())

	// Duplicate invite guard — reject if there's already a pending, non-expired invite.
	if alreadyInvited, err := h.memberships.HasPendingInvite(r.Context(), store.ID, email); err == nil && alreadyInvited {
		response.JSON(w, http.StatusConflict, map[string]any{
			"error":   "already_invited",
			"message": "Email ini sudah diundang dan menunggu konfirmasi. Hapus undangan sebelumnya jika ingin mengundang ulang.",
		})
		return
	}

	// If the email already maps to a registered user, add membership directly.
	if existing, err := h.users.FindByEmail(r.Context(), email); err == nil {
		if existing.ID == uid {
			response.Error(w, http.StatusBadRequest, "kamu sudah jadi pemilik toko ini")
			return
		}
		if err := h.memberships.AddMember(r.Context(), store.ID, existing.ID, repository.Role(role)); err != nil {
			h.logger.Error("add member", "err", err)
			response.Error(w, http.StatusInternalServerError, "gagal menambah staf")
			return
		}
		h.audit.Log(r.Context(), store.ID, audit.Event{
			Action:     "staff.added",
			EntityType: "user",
			EntityID:   existing.ID.String(),
			Summary:    "Tambah staf " + existing.Email + " sebagai " + role,
			Metadata: map[string]any{
				"target_email": existing.Email,
				"target_name":  existing.Name,
				"role":         role,
				"direct":       true,
			},
		})
		response.JSON(w, http.StatusCreated, map[string]any{
			"ok":     true,
			"direct": true,
		})
		return
	}

	// Otherwise create a pending invite — accepted on the invitee's first login.
	inv, err := h.memberships.CreateInvite(r.Context(), store.ID, email, repository.Role(role), uid)
	if err != nil {
		h.logger.Error("create invite", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal membuat undangan")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "staff.invited",
		EntityType: "invite",
		EntityID:   inv.ID.String(),
		Summary:    "Kirim undangan " + email + " sebagai " + role,
		Metadata: map[string]any{
			"target_email": email,
			"role":         role,
		},
	})

	// Send invitation email.
	inviter, _ := h.users.FindByID(r.Context(), uid)
	inviterName := store.Name // fallback to store name
	if inviter != nil && inviter.Name != "" {
		inviterName = inviter.Name
	}
	roleLabel := "Admin"
	if role == "staff" {
		roleLabel = "Staf"
	}
	loginURL := h.webOrigin + "/login"
	subject, text, htmlBody := email_pkg.RenderStaffInvite(email_pkg.StaffInviteData{
		StoreName:    store.Name,
		InviterName:  inviterName,
		InviteeEmail: email,
		Role:         roleLabel,
		LoginURL:     loginURL,
		ExpiryDays:   7,
	})
	h.mailer.Send(email_pkg.Message{
		To:       email,
		Subject:  subject,
		Text:     text,
		HTML:     htmlBody,
		Category: "staff_invite",
	})
	response.JSON(w, http.StatusCreated, map[string]any{
		"ok": true,
		"invite": inviteDTO2{
			ID: inv.ID.String(), Email: inv.Email, Role: string(inv.Role),
			CreatedAt: inv.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		},
	})
}

// DELETE /api/v1/staff/{user_id}
func (h *StaffHandler) Remove(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	if !h.ownerGate(r, store.ID) {
		response.Error(w, http.StatusForbidden, "hanya pemilik toko yang bisa menghapus staf")
		return
	}
	uid, err := uuid.Parse(chi.URLParam(r, "user_id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "user_id invalid")
		return
	}
	// Capture target identity before removal for the audit summary.
	target, _ := h.users.FindByID(r.Context(), uid)
	if err := h.memberships.Remove(r.Context(), store.ID, uid); err != nil {
		if errors.Is(err, repository.ErrMembershipNotFound) {
			response.Error(w, http.StatusNotFound, "staf tidak ditemukan atau pemilik toko")
			return
		}
		h.logger.Error("remove member", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal hapus")
		return
	}
	targetLabel := uid.String()
	targetEmail := ""
	if target != nil {
		targetLabel = target.Email
		targetEmail = target.Email
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "staff.removed",
		EntityType: "user",
		EntityID:   uid.String(),
		Summary:    "Hapus staf " + targetLabel,
		Metadata: map[string]any{
			"target_user_id": uid.String(),
			"target_email":   targetEmail,
		},
	})
	response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

type changeRoleReq struct {
	Role string `json:"role"`
}

// PUT /api/v1/staff/{user_id}/role
func (h *StaffHandler) ChangeRole(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	if !h.ownerGate(r, store.ID) {
		response.Error(w, http.StatusForbidden, "hanya pemilik toko")
		return
	}
	uid, err := uuid.Parse(chi.URLParam(r, "user_id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "user_id invalid")
		return
	}
	var req changeRoleReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	role := strings.ToLower(strings.TrimSpace(req.Role))
	if role != "admin" && role != "staff" {
		response.Error(w, http.StatusBadRequest, "role harus admin atau staff")
		return
	}
	if err := h.memberships.ChangeRole(r.Context(), store.ID, uid, repository.Role(role)); err != nil {
		if errors.Is(err, repository.ErrMembershipNotFound) {
			response.Error(w, http.StatusNotFound, "staf tidak ditemukan atau pemilik toko")
			return
		}
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	target, _ := h.users.FindByID(r.Context(), uid)
	targetLabel := uid.String()
	if target != nil {
		targetLabel = target.Email
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "staff.role_changed",
		EntityType: "user",
		EntityID:   uid.String(),
		Summary:    "Ubah role " + targetLabel + " jadi " + role,
		Metadata: map[string]any{
			"target_user_id": uid.String(),
			"new_role":       role,
		},
	})
	response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// DELETE /api/v1/staff/invites/{invite_id}
func (h *StaffHandler) DeleteInvite(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	if !h.ownerGate(r, store.ID) {
		response.Error(w, http.StatusForbidden, "hanya pemilik toko")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "invite_id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invite_id invalid")
		return
	}
	if err := h.memberships.DeleteInvite(r.Context(), store.ID, id); err != nil {
		if errors.Is(err, repository.ErrMembershipNotFound) {
			response.Error(w, http.StatusNotFound, "undangan tidak ditemukan")
			return
		}
		response.Error(w, http.StatusInternalServerError, "gagal hapus undangan")
		return
	}
	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "staff.invite_deleted",
		EntityType: "invite",
		EntityID:   id.String(),
		Summary:    "Batalkan undangan staf",
	})
	response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

