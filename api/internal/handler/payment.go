package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type PaymentHandler struct {
	gateways  *repository.PaymentRepo
	stores    *repository.StoreRepo
	encryptor *auth.AESEncryptor
	logger    *slog.Logger
}

func NewPaymentHandler(gateways *repository.PaymentRepo, stores *repository.StoreRepo, enc *auth.AESEncryptor, logger *slog.Logger) *PaymentHandler {
	return &PaymentHandler{gateways: gateways, stores: stores, encryptor: enc, logger: logger}
}

type gatewayDTO struct {
	Provider          string   `json:"provider"`
	IsConfigured      bool     `json:"is_configured"`
	IsSandbox         bool     `json:"is_sandbox"`
	ClientKey         string   `json:"client_key"`
	ServerKeyMasked   string   `json:"server_key_masked"`
	EnabledMethods    []string `json:"enabled_methods"`
	LastVerifyStatus  string   `json:"last_verify_status,omitempty"`
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
		response.JSON(w, http.StatusOK, gatewayDTO{Provider: "midtrans", IsConfigured: false, EnabledMethods: []string{}})
		return
	}
	if err != nil {
		h.logger.Error("get gateway", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, gatewayDTO{
		Provider:         g.Provider,
		IsConfigured:     true,
		IsSandbox:        g.IsSandbox,
		ClientKey:        g.ClientKey,
		ServerKeyMasked:  maskKey(len(g.ServerKeyEncrypted)),
		EnabledMethods:   g.EnabledMethods,
		LastVerifyStatus: g.LastVerifyStatus,
	})
}

type savePaymentReq struct {
	ServerKey      string   `json:"server_key"`
	ClientKey      string   `json:"client_key"`
	IsSandbox      bool     `json:"is_sandbox"`
	EnabledMethods []string `json:"enabled_methods"`
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
	req.ServerKey = strings.TrimSpace(req.ServerKey)
	if req.ServerKey == "" {
		response.Error(w, http.StatusBadRequest, "server_key wajib")
		return
	}

	encrypted, err := h.encryptor.Encrypt([]byte(req.ServerKey))
	if err != nil {
		h.logger.Error("encrypt", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal enkripsi")
		return
	}

	if req.EnabledMethods == nil {
		req.EnabledMethods = []string{}
	}

	if err := h.gateways.Upsert(r.Context(), repository.SaveGatewayInput{
		StoreID: store.ID, Provider: "midtrans",
		ServerKeyEncrypted: encrypted, ClientKey: req.ClientKey,
		IsSandbox: req.IsSandbox, EnabledMethods: req.EnabledMethods,
	}); err != nil {
		h.logger.Error("upsert gateway", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal simpan")
		return
	}

	response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// POST /api/v1/payments/midtrans/verify — stub: pretend the keys validate.
// TODO: real implementation should hit Midtrans /v2/ping with the decrypted server key.
func (h *PaymentHandler) Verify(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	if _, err := h.gateways.Get(r.Context(), store.ID, "midtrans"); err != nil {
		response.Error(w, http.StatusBadRequest, "gateway belum dikonfigurasi")
		return
	}
	if err := h.gateways.MarkVerified(r.Context(), store.ID, "midtrans", "ok"); err != nil {
		response.Error(w, http.StatusInternalServerError, "gagal update status")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{
		"ok": true, "message": "Koneksi simulasi sukses (stub).",
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
