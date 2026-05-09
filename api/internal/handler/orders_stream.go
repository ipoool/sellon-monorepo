package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/events"
	"github.com/sellon/sellon/api/internal/repository"
)

type OrderStreamHandler struct {
	stores *repository.StoreRepo
	broker *events.Broker
	logger *slog.Logger
}

func NewOrderStreamHandler(stores *repository.StoreRepo, broker *events.Broker, logger *slog.Logger) *OrderStreamHandler {
	return &OrderStreamHandler{stores: stores, broker: broker, logger: logger}
}

// GET /api/v1/orders/stream
//
// Long-lived Server-Sent Events stream that pushes "order.created" events
// for the authed seller's store. Sends a `: ping` comment every 25s so
// proxies & browser EventSource don't time out the connection.
func (h *OrderStreamHandler) Stream(w http.ResponseWriter, r *http.Request) {
	uid, _ := auth.UserIDFromContext(r.Context())
	store, err := h.stores.FindByOwnerID(r.Context(), uid)
	if err != nil {
		http.Error(w, "no store", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // disable nginx buffering

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	// http.Server has a 10s WriteTimeout; clear it for this long-lived
	// stream via the response controller (Go 1.20+).
	rc := http.NewResponseController(w)
	_ = rc.SetWriteDeadline(time.Time{})

	ch := h.broker.Subscribe(store.ID)
	defer h.broker.Unsubscribe(store.ID, ch)

	// Initial hello so the client knows the stream is live.
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
			payload, err := json.Marshal(ev.Payload)
			if err != nil {
				h.logger.Warn("sse marshal", "err", err)
				continue
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Type, payload)
			flusher.Flush()
		}
	}
}
