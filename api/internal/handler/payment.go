package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

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
	logger         *slog.Logger
	webhookBaseURL string
}

func NewPaymentHandler(
	gateways *repository.PaymentRepo,
	stores *repository.StoreRepo,
	enc *auth.AESEncryptor,
	midtrans *payments.MidtransClient,
	logger *slog.Logger,
	webhookBaseURL string,
) *PaymentHandler {
	return &PaymentHandler{
		gateways: gateways, stores: stores, encryptor: enc,
		midtrans: midtrans, logger: logger, webhookBaseURL: webhookBaseURL,
	}
}

type gatewayDTO struct {
	Provider               string   `json:"provider"`
	IsConfigured           bool     `json:"is_configured"`
	IsSandbox              bool     `json:"is_sandbox"`
	HasSandboxServerKey    bool     `json:"has_sandbox_server_key"`
	HasProdServerKey       bool     `json:"has_prod_server_key"`
	SandboxServerKeyMasked string   `json:"sandbox_server_key_masked"`
	ProdServerKeyMasked    string   `json:"prod_server_key_masked"`
	ClientKeySandbox       string   `json:"client_key_sandbox"`
	ClientKeyProd          string   `json:"client_key_prod"`
	EnabledMethods         []string `json:"enabled_methods"`
	LastVerifyStatus       string   `json:"last_verify_status,omitempty"`
	WebhookURL             string   `json:"webhook_url"`
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
			IsSandbox:      true,
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
		Provider:               g.Provider,
		IsConfigured:           len(g.ServerKeySandboxEncrypted) > 0 || len(g.ServerKeyProdEncrypted) > 0,
		IsSandbox:              g.IsSandbox,
		HasSandboxServerKey:    len(g.ServerKeySandboxEncrypted) > 0,
		HasProdServerKey:       len(g.ServerKeyProdEncrypted) > 0,
		SandboxServerKeyMasked: maskKey(len(g.ServerKeySandboxEncrypted)),
		ProdServerKeyMasked:    maskKey(len(g.ServerKeyProdEncrypted)),
		ClientKeySandbox:       g.ClientKeySandbox,
		ClientKeyProd:          g.ClientKeyProd,
		EnabledMethods:         g.EnabledMethods,
		LastVerifyStatus:       g.LastVerifyStatus,
		WebhookURL:             h.webhookBaseURL + "/webhooks/midtrans/" + g.WebhookToken,
	})
}

// POST /api/v1/payments/midtrans/rotate-webhook
func (h *PaymentHandler) RotateWebhook(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	token, err := h.gateways.RotateWebhookToken(r.Context(), store.ID, "midtrans")
	if errors.Is(err, repository.ErrGatewayNotFound) {
		response.Error(w, http.StatusBadRequest, "gateway belum dikonfigurasi")
		return
	}
	if err != nil {
		h.logger.Error("rotate webhook", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal rotate token")
		return
	}
	response.JSON(w, http.StatusOK, map[string]string{
		"webhook_url": h.webhookBaseURL + "/webhooks/midtrans/" + token,
	})
}

type savePaymentReq struct {
	// Empty = don't change. Non-empty = encrypt + store as that env's key.
	SandboxServerKey string   `json:"sandbox_server_key"`
	ProdServerKey    string   `json:"prod_server_key"`
	SandboxClientKey string   `json:"sandbox_client_key"`
	ProdClientKey    string   `json:"prod_client_key"`
	IsSandbox        bool     `json:"is_sandbox"`
	EnabledMethods   []string `json:"enabled_methods"`
}

// PUT /api/v1/payments/midtrans
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

	req.SandboxServerKey = strings.TrimSpace(req.SandboxServerKey)
	req.ProdServerKey = strings.TrimSpace(req.ProdServerKey)

	// Encrypt only the keys that were provided. Empty -> nil = don't touch.
	var sandboxBlob, prodBlob []byte
	if req.SandboxServerKey != "" {
		sandboxBlob, err = h.encryptor.Encrypt([]byte(req.SandboxServerKey))
		if err != nil {
			h.logger.Error("encrypt sandbox", "err", err)
			response.Error(w, http.StatusInternalServerError, "gagal enkripsi sandbox key")
			return
		}
	}
	if req.ProdServerKey != "" {
		prodBlob, err = h.encryptor.Encrypt([]byte(req.ProdServerKey))
		if err != nil {
			h.logger.Error("encrypt prod", "err", err)
			response.Error(w, http.StatusInternalServerError, "gagal enkripsi production key")
			return
		}
	}

	// Need at least one server key configured (existing OR new) to keep moving.
	// If first-time save, must provide the key for whichever mode is currently selected.
	existing, _ := h.gateways.Get(r.Context(), store.ID, "midtrans")
	if existing == nil {
		if req.IsSandbox && sandboxBlob == nil {
			response.Error(w, http.StatusBadRequest, "Server Key Sandbox wajib diisi")
			return
		}
		if !req.IsSandbox && prodBlob == nil {
			response.Error(w, http.StatusBadRequest, "Server Key Production wajib diisi")
			return
		}
	} else {
		if req.IsSandbox && sandboxBlob == nil && len(existing.ServerKeySandboxEncrypted) == 0 {
			response.Error(w, http.StatusBadRequest, "Mode sandbox aktif tapi Server Key Sandbox belum tersimpan — isi terlebih dahulu")
			return
		}
		if !req.IsSandbox && prodBlob == nil && len(existing.ServerKeyProdEncrypted) == 0 {
			response.Error(w, http.StatusBadRequest, "Mode produksi aktif tapi Server Key Production belum tersimpan — isi terlebih dahulu")
			return
		}
	}

	if req.EnabledMethods == nil {
		req.EnabledMethods = []string{}
	}

	if err := h.gateways.Upsert(r.Context(), repository.SaveGatewayInput{
		StoreID:                   store.ID,
		Provider:                  "midtrans",
		ServerKeySandboxEncrypted: sandboxBlob,
		ServerKeyProdEncrypted:    prodBlob,
		ClientKeySandbox:          req.SandboxClientKey,
		ClientKeyProd:             req.ProdClientKey,
		IsSandbox:                 req.IsSandbox,
		EnabledMethods:            req.EnabledMethods,
	}); err != nil {
		h.logger.Error("upsert gateway", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal simpan")
		return
	}

	response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// POST /api/v1/payments/midtrans/verify
//
// Calls Midtrans Core /v2/ping with the seller's decrypted server key for the
// active env. Treats 200 (and 404) as success; 401/403 as invalid key.
func (h *PaymentHandler) Verify(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	g, err := h.gateways.Get(r.Context(), store.ID, "midtrans")
	if err != nil {
		response.Error(w, http.StatusBadRequest, "gateway belum dikonfigurasi")
		return
	}
	var encryptedKey []byte
	if g.IsSandbox {
		encryptedKey = g.ServerKeySandboxEncrypted
	} else {
		encryptedKey = g.ServerKeyProdEncrypted
	}
	if len(encryptedKey) == 0 {
		response.Error(w, http.StatusBadRequest,
			"Server Key untuk mode aktif belum diisi")
		return
	}
	keyBytes, err := h.encryptor.Decrypt(encryptedKey)
	if err != nil {
		h.logger.Error("decrypt server key", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal decrypt key")
		return
	}

	envLabel := "sandbox"
	if !g.IsSandbox {
		envLabel = "production"
	}

	if err := h.midtrans.Ping(string(keyBytes), g.IsSandbox); err != nil {
		_ = h.gateways.MarkVerified(r.Context(), store.ID, "midtrans", "failed")
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := h.gateways.MarkVerified(r.Context(), store.ID, "midtrans", "ok"); err != nil {
		response.Error(w, http.StatusInternalServerError, "gagal update status")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"message": "Koneksi Midtrans " + envLabel + " berhasil diverifikasi.",
	})
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
