package handler

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/audit"
	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

// domainRe validates a fully-qualified hostname: lowercase letters, digits,
// hyphens, dots. At least two labels required (e.g. sub.brand.com).
var domainRe = regexp.MustCompile(`^([a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$`)

// domainVerifyHost is the label a seller must add the ownership TXT record
// under: _sellon-verify.<domain>.
const domainVerifyPrefix = "_sellon-verify."

// domainVerifyToken derives the per-store proof-of-ownership value for a
// domain. Deterministic (no column, no expiry, survives restarts) and
// store-scoped, so pointing a CNAME at cname.sellon.id is no longer enough
// on its own to claim a hostname:
//
//   - dangling CNAME: an abandoned DNS record can't be hijacked by another
//     seller, because they can't produce the victim's TXT value;
//   - squatting: reserving someone else's domain is now harmless, since
//     only the party who can edit its DNS can ever verify it.
//
// The store_id half is a server-side secret from an attacker's point of
// view — it is never exposed on public endpoints, only on the owner's own
// authenticated /store payload.
func domainVerifyToken(storeID uuid.UUID, domain string) string {
	sum := sha256.Sum256([]byte(storeID.String() + ":" + strings.ToLower(domain)))
	return "sellon-verify=" + hex.EncodeToString(sum[:])[:32]
}

type DomainHandler struct {
	stores      *repository.StoreRepo
	subs        *repository.SubscriptionRepo
	audit       *audit.Logger
	cnameTarget string
	logger      *slog.Logger
}

func NewDomainHandler(
	stores *repository.StoreRepo,
	subs *repository.SubscriptionRepo,
	auditLog *audit.Logger,
	cnameTarget string,
	logger *slog.Logger,
) *DomainHandler {
	return &DomainHandler{
		stores: stores, subs: subs,
		audit: auditLog, cnameTarget: cnameTarget,
		logger: logger,
	}
}

// PUT /api/v1/store/custom-domain — save or update the store's custom domain.
// Bisnis plan only. Sets domain_status to 'pending' until verified.
func (h *DomainHandler) Set(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserIDFromContext(r.Context())
	store, err := h.stores.FindByOwnerID(r.Context(), uid)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.Error(w, http.StatusNotFound, "toko belum dibuat")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	sub, err := h.subs.GetOrCreate(r.Context(), store.ID)
	if err != nil || sub.Plan != "bisnis" {
		response.Error(w, http.StatusPaymentRequired,
			"Custom domain hanya tersedia untuk paket Bisnis")
		return
	}

	var req struct {
		Domain string `json:"domain"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	domain := strings.ToLower(strings.TrimSpace(req.Domain))

	if !domainRe.MatchString(domain) {
		response.Error(w, http.StatusBadRequest,
			"Format domain tidak valid. Masukkan subdomain seperti toko.brandkamu.com")
		return
	}
	if domain == "sellon.id" || strings.HasSuffix(domain, ".sellon.id") {
		response.Error(w, http.StatusBadRequest,
			"Domain platform (sellon.id) tidak bisa digunakan sebagai custom domain")
		return
	}

	// Only an ACTIVE domain elsewhere blocks the claim. A domain another
	// store merely reserved (pending/failed) is fair game — see migration
	// 0099; ownership is settled by the TXT record at verify time, not by
	// who typed the name first.
	if taken, terr := h.stores.DomainActiveElsewhere(r.Context(), store.ID, domain); terr == nil && taken {
		response.Error(w, http.StatusConflict, "Domain sudah aktif di toko lain")
		return
	}

	updated, err := h.stores.SetCustomDomain(r.Context(), store.ID, domain)
	if errors.Is(err, repository.ErrDomainTaken) {
		response.Error(w, http.StatusConflict, "Domain sudah digunakan oleh toko lain")
		return
	}
	if err != nil {
		h.logger.Error("set custom domain", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal menyimpan domain")
		return
	}

	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action: "store.custom_domain_set", EntityType: "store",
		EntityID: store.ID.String(),
		Summary:  "Custom domain diatur ke " + domain,
		Metadata: map[string]any{"domain": domain},
	})
	response.JSON(w, http.StatusOK, map[string]any{
		"store":            toStoreDTO(updated),
		"cname_target":     h.cnameTarget,
		"verify_txt_name":  domainVerifyPrefix + domain,
		"verify_txt_value": domainVerifyToken(store.ID, domain),
	})
}

// POST /api/v1/store/custom-domain/verify — perform a live DNS CNAME check.
// Updates domain_status to 'active' if the CNAME points to cnameTarget,
// or 'failed' otherwise.
func (h *DomainHandler) Verify(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserIDFromContext(r.Context())
	store, err := h.stores.FindByOwnerID(r.Context(), uid)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.Error(w, http.StatusNotFound, "toko belum dibuat")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	sub, err := h.subs.GetOrCreate(r.Context(), store.ID)
	if err != nil || sub.Plan != "bisnis" {
		response.Error(w, http.StatusPaymentRequired,
			"Custom domain hanya tersedia untuk paket Bisnis")
		return
	}

	if store.CustomDomain == nil || *store.CustomDomain == "" {
		response.Error(w, http.StatusBadRequest, "Belum ada domain yang dikonfigurasi")
		return
	}

	domain := *store.CustomDomain

	// Someone else already serves this hostname — refuse before touching
	// DNS so two stores can never both hold it active.
	if taken, terr := h.stores.DomainActiveElsewhere(r.Context(), store.ID, domain); terr == nil && taken {
		response.Error(w, http.StatusConflict, "Domain sudah aktif di toko lain")
		return
	}

	newStatus := "failed"

	// DNS lookup with a hard 5-second timeout so a slow resolver never hangs
	// the HTTP handler.
	dnsCtx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	cnameOK := false
	if cname, lookupErr := net.DefaultResolver.LookupCNAME(dnsCtx, domain); lookupErr == nil {
		resolved := strings.TrimSuffix(strings.ToLower(cname), ".")
		expected := strings.TrimSuffix(strings.ToLower(h.cnameTarget), ".")
		cnameOK = resolved == expected
	} else {
		h.logger.Warn("dns cname lookup failed", "domain", domain, "err", lookupErr)
	}

	// The CNAME alone only proves "this name points at our edge" — it says
	// nothing about WHICH store owns it, so a dangling record left behind
	// by another seller could be hijacked. The per-store TXT record is the
	// actual proof of control.
	txtOK := false
	wantTXT := domainVerifyToken(store.ID, domain)
	if records, lookupErr := net.DefaultResolver.LookupTXT(dnsCtx, domainVerifyPrefix+domain); lookupErr == nil {
		for _, rec := range records {
			if strings.EqualFold(strings.TrimSpace(rec), wantTXT) {
				txtOK = true
				break
			}
		}
	} else {
		h.logger.Warn("dns txt lookup failed", "domain", domain, "err", lookupErr)
	}

	if cnameOK && txtOK {
		newStatus = "active"
	}

	updated, err := h.stores.SetDomainStatus(r.Context(), store.ID, newStatus)
	if err != nil {
		h.logger.Error("set domain status", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal update status domain")
		return
	}

	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action: "store.custom_domain_verified", EntityType: "store",
		EntityID: store.ID.String(),
		Summary:  "Verifikasi domain " + domain + " → " + newStatus,
		Metadata: map[string]any{
			"domain": domain, "status": newStatus,
			"cname_ok": cnameOK, "txt_ok": txtOK,
		},
	})
	response.JSON(w, http.StatusOK, map[string]any{
		"store":            toStoreDTO(updated),
		"domain_status":    newStatus,
		"cname_ok":         cnameOK,
		"txt_ok":           txtOK,
		"verify_txt_name":  domainVerifyPrefix + domain,
		"verify_txt_value": wantTXT,
	})
}

// DELETE /api/v1/store/custom-domain — remove the custom domain entirely.
// No plan gate: sellers who downgrade should still be able to clean up.
func (h *DomainHandler) Delete(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserIDFromContext(r.Context())
	store, err := h.stores.FindByOwnerID(r.Context(), uid)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.Error(w, http.StatusNotFound, "toko belum dibuat")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	updated, err := h.stores.ClearCustomDomain(r.Context(), store.ID)
	if err != nil {
		h.logger.Error("clear custom domain", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal menghapus domain")
		return
	}

	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action: "store.custom_domain_cleared", EntityType: "store",
		EntityID: store.ID.String(),
		Summary:  "Custom domain dihapus",
	})
	response.JSON(w, http.StatusOK, map[string]any{"store": toStoreDTO(updated)})
}
