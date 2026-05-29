package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/events"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

type KDSHandler struct {
	kitchen *repository.KitchenRepo
	stores  *repository.StoreRepo
	broker  *events.Broker
	logger  *slog.Logger
}

func NewKDSHandler(kitchen *repository.KitchenRepo, stores *repository.StoreRepo, broker *events.Broker, logger *slog.Logger) *KDSHandler {
	return &KDSHandler{kitchen: kitchen, stores: stores, broker: broker, logger: logger}
}

func (h *KDSHandler) requireStore(r *http.Request) (*repository.Store, error) {
	uid, _ := auth.UserIDFromContext(r.Context())
	return h.stores.FindByOwnerID(r.Context(), uid)
}

func kitchenOrderDTO(k repository.KitchenOrder) map[string]any {
	items := make([]map[string]any, 0, len(k.Items))
	for _, it := range k.Items {
		items = append(items, map[string]any{"name": it.Name, "quantity": it.Quantity})
	}
	return map[string]any{
		"order_id":       k.OrderID.String(),
		"order_number":   k.OrderNumber,
		"queue_number":   k.QueueNumber,
		"kitchen_status": k.KitchenStatus,
		"serving_type":   k.ServingType,
		"table_label":    k.TableLabel,
		"customer_name":  k.CustomerName,
		"created_at":     k.CreatedAt.Format(time.RFC3339),
		"items":          items,
	}
}

// GET /api/v1/kds/orders
func (h *KDSHandler) List(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.JSON(w, http.StatusOK, map[string]any{"orders": []any{}})
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	rows, err := h.kitchen.ListActive(r.Context(), store.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]map[string]any, 0, len(rows))
	for _, k := range rows {
		out = append(out, kitchenOrderDTO(k))
	}
	response.JSON(w, http.StatusOK, map[string]any{"orders": out})
}

// POST /api/v1/kds/orders/{id}/bump
func (h *KDSHandler) Bump(w http.ResponseWriter, r *http.Request) {
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
	next, err := h.kitchen.Bump(r.Context(), store.ID, id)
	if errors.Is(err, repository.ErrKitchenOrderNotFound) {
		response.Error(w, http.StatusNotFound, "pesanan tidak ditemukan")
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if h.broker != nil {
		h.broker.Publish(store.ID, events.Event{
			Type:    "kds.order.bumped",
			Payload: map[string]any{"order_id": id.String(), "kitchen_status": next},
		})
		h.broker.Publish(store.ID, events.Event{Type: "queue.updated", Payload: map[string]any{}})
	}
	response.JSON(w, http.StatusOK, map[string]any{"kitchen_status": next})
}

// GET /api/v1/kds/stream — SSE for the KDS board.
func (h *KDSHandler) Stream(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		http.Error(w, "no store", http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}
	rc := http.NewResponseController(w)
	_ = rc.SetWriteDeadline(time.Time{})

	ch := h.broker.Subscribe(store.ID)
	defer h.broker.Unsubscribe(store.ID, ch)
	fmt.Fprintf(w, "event: hello\ndata: {\"store_id\":%q}\n\n", store.ID.String())
	flusher.Flush()
	ping := time.NewTicker(25 * time.Second)
	defer ping.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-ping.C:
			fmt.Fprint(w, ": ping\n\n")
			flusher.Flush()
		case ev, ok := <-ch:
			if !ok {
				return
			}
			// Only forward kitchen/queue events to the KDS board.
			if ev.Type != "kds.order.created" && ev.Type != "kds.order.bumped" && ev.Type != "queue.updated" {
				continue
			}
			payload, _ := json.Marshal(ev.Payload)
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Type, payload)
			flusher.Flush()
		}
	}
}

// GET /api/v1/storefront/{slug}/queue — PUBLIC queue board feed.
func (h *KDSHandler) PublicQueue(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	store, err := h.stores.FindBySlug(r.Context(), slug)
	if err != nil {
		response.Error(w, http.StatusNotFound, "toko tidak ditemukan")
		return
	}
	rows, err := h.kitchen.ListQueue(r.Context(), store.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	preparing := []int{}
	ready := []int{}
	for _, k := range rows {
		if k.QueueNumber == nil {
			continue
		}
		if k.KitchenStatus == "ready" {
			ready = append(ready, *k.QueueNumber)
		} else {
			preparing = append(preparing, *k.QueueNumber)
		}
	}
	response.JSON(w, http.StatusOK, map[string]any{
		"store_name": store.Name,
		"preparing":  preparing,
		"ready":      ready,
	})
}
