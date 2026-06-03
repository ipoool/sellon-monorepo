package meta

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/domain/feature"
	"github.com/sellon/sellon/api/internal/repository"
)

// Notifier orchestrates the server-side Purchase event: it loads the store's
// Meta config + the paid order, decrypts the CAPI token, and sends the event.
// Mirrors fulfillment.Fulfiller (depends on repos). Callers invoke OnPaymentPaid
// in a fire-and-forget goroutine — it must never block the user response.
type Notifier struct {
	stores    *repository.StoreRepo
	orders    *repository.OrderRepo
	subs      *repository.SubscriptionRepo
	encryptor *auth.AESEncryptor
	client    *Client
	webOrigin string
	logger    *slog.Logger
}

func NewNotifier(stores *repository.StoreRepo, orders *repository.OrderRepo, subs *repository.SubscriptionRepo, enc *auth.AESEncryptor, client *Client, webOrigin string, logger *slog.Logger) *Notifier {
	return &Notifier{
		stores:    stores,
		orders:    orders,
		subs:      subs,
		encryptor: enc,
		client:    client,
		webOrigin: strings.TrimRight(webOrigin, "/"),
		logger:    logger,
	}
}

// OnPaymentPaid sends a Meta Purchase conversion for a just-paid order. No-op
// (silent) when the store hasn't enabled Meta or has no token. Designed to be
// called as `go notifier.OnPaymentPaid(ctx, storeID, orderID)`.
func (n *Notifier) OnPaymentPaid(ctx context.Context, storeID, orderID uuid.UUID) {
	if n == nil || n.client == nil {
		return
	}
	store, err := n.stores.FindByID(ctx, storeID)
	if err != nil {
		return
	}
	if !store.MetaEnabled || store.MetaPixelID == "" || len(store.MetaAccessTokenEnc) == 0 {
		return // integration off — nothing to send
	}
	// Re-check plan: a store that enabled Meta then downgraded must stop
	// sending conversions for a feature it no longer pays for (mirrors the
	// seller-banner public-leak fix). Fail open on a lookup error so a paying
	// store never loses tracking to a transient DB blip.
	if n.subs != nil {
		if plan, perr := n.subs.GetPlan(ctx, storeID); perr == nil && !feature.HasFeature(plan, feature.MetaIntegration) {
			return
		}
	}
	tokenBytes, err := n.encryptor.Decrypt(store.MetaAccessTokenEnc)
	if err != nil {
		n.logger.Error("meta: decrypt token", "err", err, "store_id", storeID)
		return
	}

	order, err := n.orders.FindByID(ctx, storeID, orderID)
	if err != nil {
		return
	}
	// Meta CAPI rejects a Purchase with no user_data identifier. Anonymous
	// orders (e.g. kiosk) carry neither email nor phone — skip rather than
	// fire a guaranteed-400 + noisy log. Their browser Pixel event (with
	// fbp/fbc) still covers them when they came from an ad.
	if order.CustomerEmail == "" && order.CustomerWhatsApp == "" {
		return
	}
	items, err := n.orders.ListItems(ctx, orderID)
	if err != nil {
		n.logger.Error("meta: list items", "err", err, "order_id", orderID)
		return
	}

	contents := make([]Content, 0, len(items))
	for _, it := range items {
		if it.ProductID == nil {
			continue // deleted product — can't match a catalog id
		}
		contents = append(contents, Content{
			ID:        it.ProductID.String(),
			Quantity:  it.Quantity,
			ItemPrice: float64(it.UnitPriceCents) / 100,
		})
	}

	eventURL := ""
	if n.webOrigin != "" {
		eventURL = n.webOrigin + "/" + store.Slug + "/order/" + order.OrderNumber
	}

	if err := n.client.SendPurchase(ctx, PurchaseEvent{
		PixelID:        store.MetaPixelID,
		AccessToken:    string(tokenBytes),
		TestEventCode:  store.MetaTestEventCode,
		EventID:        order.OrderNumber, // dedupe with the browser Pixel Purchase
		EventTime:      time.Now().Unix(),
		EventSourceURL: eventURL,
		Email:          order.CustomerEmail,
		Phone:          order.CustomerWhatsApp,
		Currency:       "IDR",
		Value:          float64(order.TotalCents) / 100,
		Contents:       contents,
	}); err != nil {
		n.logger.Warn("meta: send purchase", "err", err, "order", order.OrderNumber)
	}
}
