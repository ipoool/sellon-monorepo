package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type BankAccountHandler struct {
	accounts *repository.BankAccountRepo
	stores   *repository.StoreRepo
	logger   *slog.Logger
}

func NewBankAccountHandler(a *repository.BankAccountRepo, s *repository.StoreRepo, logger *slog.Logger) *BankAccountHandler {
	return &BankAccountHandler{accounts: a, stores: s, logger: logger}
}

type bankAccountDTO struct {
	ID         string `json:"id"`
	BankName   string `json:"bank_name"`
	HolderName string `json:"holder_name"`
	AccountNo  string `json:"account_no"`
	IsPrimary  bool   `json:"is_primary"`
	QRISURL    string `json:"qris_url"`
}

func toBankAccountDTO(a *repository.BankAccount) bankAccountDTO {
	return bankAccountDTO{
		ID: a.ID.String(), BankName: a.BankName, HolderName: a.HolderName,
		AccountNo: a.AccountNo, IsPrimary: a.IsPrimary, QRISURL: a.QRISURL,
	}
}

// GET /api/v1/bank-accounts
func (h *BankAccountHandler) List(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.JSON(w, http.StatusOK, map[string]any{"accounts": []bankAccountDTO{}})
		return
	}
	rows, err := h.accounts.ListByStore(r.Context(), store.ID)
	if err != nil {
		h.logger.Error("list bank accounts", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]bankAccountDTO, 0, len(rows))
	for i := range rows {
		out = append(out, toBankAccountDTO(&rows[i]))
	}
	response.JSON(w, http.StatusOK, map[string]any{"accounts": out})
}

type bankAccountReq struct {
	BankName   string `json:"bank_name"`
	HolderName string `json:"holder_name"`
	AccountNo  string `json:"account_no"`
	IsPrimary  bool   `json:"is_primary"`
	QRISURL    string `json:"qris_url"`
}

func (req bankAccountReq) validate() error {
	if strings.TrimSpace(req.BankName) == "" && strings.TrimSpace(req.QRISURL) == "" {
		return errors.New("isi minimal bank/holder/account atau URL QRIS")
	}
	if req.BankName != "" {
		if strings.TrimSpace(req.HolderName) == "" || strings.TrimSpace(req.AccountNo) == "" {
			return errors.New("nama pemilik dan nomor rekening wajib diisi")
		}
	}
	return nil
}

// POST /api/v1/bank-accounts
func (h *BankAccountHandler) Create(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	var req bankAccountReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := req.validate(); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	a, err := h.accounts.Create(r.Context(), repository.SaveBankAccountInput{
		StoreID: store.ID,
		BankName: strings.TrimSpace(req.BankName),
		HolderName: strings.TrimSpace(req.HolderName),
		AccountNo: strings.TrimSpace(req.AccountNo),
		IsPrimary: req.IsPrimary, QRISURL: strings.TrimSpace(req.QRISURL),
	})
	if err != nil {
		h.logger.Error("create bank account", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal simpan")
		return
	}
	response.JSON(w, http.StatusCreated, map[string]any{"account": toBankAccountDTO(a)})
}

// PUT /api/v1/bank-accounts/{id}
func (h *BankAccountHandler) Update(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req bankAccountReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := req.validate(); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := h.accounts.Update(r.Context(), store.ID, id, repository.SaveBankAccountInput{
		StoreID: store.ID,
		BankName: strings.TrimSpace(req.BankName),
		HolderName: strings.TrimSpace(req.HolderName),
		AccountNo: strings.TrimSpace(req.AccountNo),
		IsPrimary: req.IsPrimary, QRISURL: strings.TrimSpace(req.QRISURL),
	}); err != nil {
		if errors.Is(err, repository.ErrBankAccountNotFound) {
			response.Error(w, http.StatusNotFound, "rekening tidak ditemukan")
			return
		}
		h.logger.Error("update bank account", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal update")
		return
	}
	response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// DELETE /api/v1/bank-accounts/{id}
func (h *BankAccountHandler) Delete(w http.ResponseWriter, r *http.Request) {
	store, err := h.storeFor(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.accounts.Delete(r.Context(), store.ID, id); err != nil {
		if errors.Is(err, repository.ErrBankAccountNotFound) {
			response.Error(w, http.StatusNotFound, "rekening tidak ditemukan")
			return
		}
		response.Error(w, http.StatusInternalServerError, "gagal hapus")
		return
	}
	response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *BankAccountHandler) storeFor(r *http.Request) (*repository.Store, error) {
	uid, _ := auth.UserIDFromContext(r.Context())
	return h.stores.FindByOwnerID(r.Context(), uid)
}
