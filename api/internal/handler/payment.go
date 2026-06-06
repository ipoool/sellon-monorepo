package handler

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/sellon/sellon/api/internal/audit"
	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/payments"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type PaymentHandler struct {
	gateways       *repository.PaymentRepo
	stores         *repository.StoreRepo
	encryptor      *auth.AESEncryptor
	midtrans       *payments.MidtransClient
	audit          *audit.Logger
	logger         *slog.Logger
	webhookBaseURL string
}

func NewPaymentHandler(
	gateways *repository.PaymentRepo,
	stores *repository.StoreRepo,
	enc *auth.AESEncryptor,
	midtrans *payments.MidtransClient,
	audit *audit.Logger,
	logger *slog.Logger,
	webhookBaseURL string,
) *PaymentHandler {
	return &PaymentHandler{
		gateways: gateways, stores: stores, encryptor: enc,
		midtrans: midtrans,
		audit:    audit,
		logger:   logger, webhookBaseURL: webhookBaseURL,
	}
}

// gatewayDTO is production-only (sandbox removed from the seller integration).
// The DB still has the dormant sandbox columns, but they're never surfaced.
type gatewayDTO struct {
	Provider         string   `json:"provider"`
	IsConfigured     bool     `json:"is_configured"`
	HasServerKey     bool     `json:"has_server_key"`
	ServerKeyMasked  string   `json:"server_key_masked"`
	ClientKey        string   `json:"client_key"`
	EnabledMethods   []string `json:"enabled_methods"`
	LastVerifyStatus string   `json:"last_verify_status,omitempty"`
	WebhookURL       string   `json:"webhook_url"`
}

// GET /api/v1/payments/midtrans
func (h *PaymentHandler) Get(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	g, err := h.gateways.Get(r.Context(), store.ID, "midtrans")
	if errors.Is(err, repository.ErrGatewayNotFound) {
		response.JSON(w, http.StatusOK, gatewayDTO{
			Provider:       "midtrans",
			IsConfigured:   false,
			EnabledMethods: []string{},
			WebhookURL:     "",
		})
		return
	}
	if err != nil {
		h.logger.Error("get gateway", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, gatewayDTO{
		Provider:         g.Provider,
		IsConfigured:     len(g.ServerKeyProdEncrypted) > 0,
		HasServerKey:     len(g.ServerKeyProdEncrypted) > 0,
		ServerKeyMasked:  maskKey(len(g.ServerKeyProdEncrypted)),
		ClientKey:        g.ClientKeyProd,
		EnabledMethods:   g.EnabledMethods,
		LastVerifyStatus: g.LastVerifyStatus,
		WebhookURL:       h.webhookBaseURL + "/webhooks/midtrans/" + g.WebhookToken,
	})
}

// POST /api/v1/payments/midtrans/rotate-webhook
//
// Generate URL webhook baru. Side effects:
//   - Toko otomatis di-set offline (is_open=false). Sampai seller paste
//     URL baru di dashboard Midtrans, notifikasi pembayaran tidak akan
//     sampai ke SellOn — toko offline lebih aman daripada nampung order
//     dengan webhook patah.
//   - Audit log mencatat URL lama vs URL baru di metadata supaya seller
//     bisa lihat di tab Aktivitas.
func (h *PaymentHandler) RotateWebhook(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	oldToken, newToken, err := h.gateways.RotateWebhookToken(r.Context(), store.ID, "midtrans")
	if errors.Is(err, repository.ErrGatewayNotFound) {
		response.Error(w, http.StatusBadRequest, "gateway belum dikonfigurasi")
		return
	}
	if err != nil {
		h.logger.Error("rotate webhook", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal rotate token")
		return
	}

	oldURL := h.webhookBaseURL + "/webhooks/midtrans/" + oldToken
	newURL := h.webhookBaseURL + "/webhooks/midtrans/" + newToken

	// Toko di-offline supaya pembeli tidak sempat order sebelum webhook
	// baru terdaftar di Midtrans. Failure di-log tapi tidak block
	// response — token sudah ter-rotate, seller wajib update Midtrans.
	storeWasOpen := store.IsOpen
	if storeWasOpen {
		if err := h.stores.SetIsOpen(r.Context(), store.ID, false); err != nil {
			h.logger.Warn("rotate webhook: set offline", "err", err, "store_id", store.ID)
		}
	}

	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "payment_gateway.webhook_rotated",
		EntityType: "payment_gateway",
		Summary:    "Rotate webhook Midtrans — toko di-set offline sampai URL baru ter-update di Midtrans",
		Metadata: map[string]any{
			"provider":         "midtrans",
			"old_webhook_url":  oldURL,
			"new_webhook_url":  newURL,
			"store_set_offline": storeWasOpen,
		},
	})
	response.JSON(w, http.StatusOK, map[string]any{
		"webhook_url":       newURL,
		"old_webhook_url":   oldURL,
		"store_set_offline": storeWasOpen,
	})
}

type savePaymentReq struct {
	// Empty server_key = don't change (keep the stored one).
	ServerKey      string   `json:"server_key"`
	ClientKey      string   `json:"client_key"`
	EnabledMethods []string `json:"enabled_methods"`
}

// PUT /api/v1/payments/midtrans — production keys only (sandbox removed).
func (h *PaymentHandler) Save(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	var req savePaymentReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}

	req.ServerKey = strings.TrimSpace(req.ServerKey)

	// Encrypt the server key only if provided. Empty -> nil = keep existing.
	var prodBlob []byte
	if req.ServerKey != "" {
		prodBlob, err = h.encryptor.Encrypt([]byte(req.ServerKey))
		if err != nil {
			h.logger.Error("encrypt server key", "err", err)
			response.Error(w, http.StatusInternalServerError, "gagal enkripsi server key")
			return
		}
	}

	// Need a server key configured (existing OR new).
	existing, _ := h.gateways.Get(r.Context(), store.ID, "midtrans")
	if prodBlob == nil && (existing == nil || len(existing.ServerKeyProdEncrypted) == 0) {
		response.Error(w, http.StatusBadRequest, "Server Key wajib diisi")
		return
	}

	if req.EnabledMethods == nil {
		req.EnabledMethods = []string{}
	}

	// Preserve the dormant sandbox columns as-is; only write the prod key/client
	// key and force is_sandbox=false (seller integration is production-only).
	var keepSandboxClient string
	if existing != nil {
		keepSandboxClient = existing.ClientKeySandbox
	}
	if err := h.gateways.Upsert(r.Context(), repository.SaveGatewayInput{
		StoreID:                   store.ID,
		Provider:                  "midtrans",
		ServerKeySandboxEncrypted: nil, // COALESCE preserves existing
		ServerKeyProdEncrypted:    prodBlob,
		ClientKeySandbox:          keepSandboxClient,
		ClientKeyProd:             req.ClientKey,
		IsSandbox:                 false,
		EnabledMethods:            req.EnabledMethods,
	}); err != nil {
		h.logger.Error("upsert gateway", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal simpan")
		return
	}

	h.audit.Log(r.Context(), store.ID, audit.Event{
		Action:     "payment_gateway.updated",
		EntityType: "payment_gateway",
		Summary:    "Update Midtrans",
		Metadata: map[string]any{
			"provider":        "midtrans",
			"enabled_methods": req.EnabledMethods,
			"server_key_set":  prodBlob != nil,
		},
	})

	response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// POST /api/v1/payments/midtrans/connect
//
// Verifies the seller's production Midtrans keys by creating a real (but tiny,
// Rp 1.000) Snap transaction for a dummy product and returning the snap token +
// client key. The frontend opens the Snap popup with snap.js — the popup showing
// up confirms both keys: the server key created the token (Midtrans rejects an
// invalid key with 401), and the client key renders snap.js. The seller just
// closes the popup; no payment is needed. We mark verified on token creation.
func (h *PaymentHandler) Connect(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	g, err := h.gateways.Get(r.Context(), store.ID, "midtrans")
	if err != nil || len(g.ServerKeyProdEncrypted) == 0 {
		response.Error(w, http.StatusBadRequest, "Server Key belum tersimpan — simpan kunci terlebih dahulu")
		return
	}
	if strings.TrimSpace(g.ClientKeyProd) == "" {
		response.Error(w, http.StatusBadRequest, "Client Key belum tersimpan — simpan kunci terlebih dahulu")
		return
	}

	keyBytes, err := h.encryptor.Decrypt(g.ServerKeyProdEncrypted)
	if err != nil {
		h.logger.Error("decrypt server key", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal decrypt key")
		return
	}

	orderID, err := connectOrderID()
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "gagal membuat id transaksi")
		return
	}

	snap, err := h.midtrans.CreateSnapTransaction(payments.SnapTransactionInput{
		OrderID:      orderID,
		GrossAmount:  100000, // cents → Rp 1.000 (CreateSnapTransaction divides by 100)
		CustomerName: store.Name,
		Items: []payments.SnapItem{{
			ID:       "connect-test",
			Name:     "Tes Koneksi SellOn",
			Price:    100000,
			Quantity: 1,
		}},
		ServerKey: string(keyBytes),
	})
	if err != nil {
		_ = h.gateways.MarkVerified(r.Context(), store.ID, "midtrans", "failed")
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := h.gateways.MarkVerified(r.Context(), store.ID, "midtrans", "ok"); err != nil {
		response.Error(w, http.StatusInternalServerError, "gagal update status")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{
		"token":      snap.Token,
		"client_key": g.ClientKeyProd,
	})
}

// connectOrderID returns a unique dummy order id for a connection test.
// Midtrans rejects duplicate order_ids, so each call must be unique.
func connectOrderID() (string, error) {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return "CONNECT-" + strings.ToUpper(hex.EncodeToString(buf)), nil
}

func (h *PaymentHandler) storeFor(r *http.Request) (*repository.Store, error) {
	uid, _ := auth.UserIDFromContext(r.Context())
	return h.stores.FindByOwnerID(r.Context(), uid)
}

func maskKey(byteLen int) string {
	if byteLen == 0 {
		return ""
	}
	return "•••••••••••• tersimpan (" + itoaInt(byteLen) + " bytes)"
}

func itoaInt(n int) string {
	if n == 0 {
		return "0"
	}
	buf := make([]byte, 0, 10)
	for n > 0 {
		buf = append([]byte{byte('0' + n%10)}, buf...)
		n /= 10
	}
	return string(buf)
}
