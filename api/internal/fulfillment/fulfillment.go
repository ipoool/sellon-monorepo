// Package fulfillment runs the post-payment side-effects for digital
// orders: auto-completing the order, generating download tokens, and
// emailing the buyer the link. Centralized here so the manual
// MarkPaid handler, the Midtrans webhook, and any future automation
// all go through the same code path.
package fulfillment

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/email"
	"github.com/sellon/sellon/api/internal/repository"
)

type Fulfiller struct {
	orders         *repository.OrderRepo
	stores         *repository.StoreRepo
	tokens         *repository.DownloadTokenRepo
	mailer         *email.Mailer
	webOrigin      string
	logger         *slog.Logger
}

func New(
	orders *repository.OrderRepo,
	stores *repository.StoreRepo,
	tokens *repository.DownloadTokenRepo,
	mailer *email.Mailer,
	webOrigin string,
	logger *slog.Logger,
) *Fulfiller {
	return &Fulfiller{
		orders: orders, stores: stores, tokens: tokens,
		mailer: mailer, webOrigin: webOrigin, logger: logger,
	}
}

// OnPaymentPaid is the single entry point for "an order just got paid".
// Idempotent — the underlying token Create is keyed by order_item_id, so
// calling it twice on the same order won't re-mint tokens.
//
// Mints download tokens for every digital line item, even when the cart
// also contains physical items (BUG-022: mixed-cart buyers were paying
// for ebooks and never receiving links). The order itself is only
// auto-completed when every line is digital — physical items still
// require the seller's manual ship workflow.
func (f *Fulfiller) OnPaymentPaid(ctx context.Context, storeID, orderID uuid.UUID) {
	if f == nil {
		return
	}

	digitalItems, _, err := f.orders.PrepareDigitalFulfillment(ctx, orderID)
	if err != nil {
		f.logger.Error("fulfillment: prepare digital", "err", err, "order_id", orderID)
		return
	}
	if len(digitalItems) == 0 {
		// No digital line items — physical-only order, nothing to do here.
		return
	}

	store, err := f.stores.FindByID(ctx, storeID)
	if err != nil {
		f.logger.Error("fulfillment: load store", "err", err, "store_id", storeID)
		return
	}

	order, err := f.orders.FindByID(ctx, storeID, orderID)
	if err != nil {
		f.logger.Error("fulfillment: load order", "err", err, "order_id", orderID)
		return
	}

	// Mint a token per digital item. We use no expiry here — the
	// founder said "no auto-expire". Sellers worried about stale
	// tokens can manually invalidate later via a future admin tool.
	type minted struct {
		token       string
		productName string
		variantName string
	}
	var tokens []minted
	for _, it := range digitalItems {
		t, err := f.tokens.Create(ctx, repository.DownloadToken{
			OrderID:     orderID,
			OrderItemID: it.ID,
			StoreID:     storeID,
		})
		if err != nil {
			f.logger.Error("fulfillment: create token",
				"err", err, "order_id", orderID, "order_item_id", it.ID)
			continue
		}
		tokens = append(tokens, minted{
			token:       t.Token,
			productName: it.ProductName,
			variantName: it.VariantName,
		})
	}
	if len(tokens) == 0 {
		return
	}

	// Email the buyer. Skip if the buyer didn't supply an email (the
	// storefront enforces this for all-digital carts, but defensively
	// no-op here too).
	if !f.mailer.Configured() || strings.TrimSpace(order.CustomerEmail) == "" {
		return
	}

	origin := strings.TrimRight(f.webOrigin, "/")

	// Build a multi-link summary. For one item, single link is the
	// hero CTA. For multiple, list each link.
	links := make([]email.DownloadLink, 0, len(tokens))
	for _, t := range tokens {
		name := t.productName
		if t.variantName != "" {
			name += " — " + t.variantName
		}
		links = append(links, email.DownloadLink{
			Name: name,
			URL:  origin + "/download/" + t.token,
		})
	}

	subject, text, htmlBody := email.RenderDigitalDelivery(email.DigitalDeliveryData{
		StoreName:    store.Name,
		OrderNumber:  order.OrderNumber,
		CustomerName: order.CustomerName,
		Links:        links,
	})

	f.mailer.Send(email.Message{
		To:       order.CustomerEmail,
		ToName:   order.CustomerName,
		Subject:  subject,
		Text:     text,
		HTML:     htmlBody,
		Category: "digital_delivery",
	})

	// best-effort log so seller debugging is easier
	f.logger.Info("digital order fulfilled",
		"order_id", orderID, "store_id", storeID,
		"items", len(tokens), "email", order.CustomerEmail,
		"completed_at", time.Now().UTC().Format(time.RFC3339))
}
