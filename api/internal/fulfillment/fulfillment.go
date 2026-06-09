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

// accessExpiry turns a product's access-validity snapshot into a download-token
// expiry. Lifetime (value<=0) or any unrecognized unit → nil = no expiry.
// week/month/year use calendar math (AddDate) from now, so "3 bulan" is exactly
// three calendar months rather than 90 fixed days.
func accessExpiry(value int, unit string) *time.Time {
	if value <= 0 {
		return nil
	}
	now := time.Now()
	var t time.Time
	switch unit {
	case "week":
		t = now.AddDate(0, 0, 7*value)
	case "month":
		t = now.AddDate(0, value, 0)
	case "year":
		t = now.AddDate(value, 0, 0)
	default:
		return nil
	}
	return &t
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

	// Mint a token per digital item. Expiry comes from the product's access
	// validity ("masa aktif"): lifetime → no expiry; week/month/year → a
	// calendar-correct expires_at from now (the OTP/download gate then returns
	// "link sudah kedaluwarsa" once past it). Today only course products expose
	// a control, so digital items stay lifetime.
	type minted struct {
		token       string
		productType string
		productName string
		variantName string
	}
	var tokens []minted
	for _, it := range digitalItems {
		t, err := f.tokens.Create(ctx, repository.DownloadToken{
			OrderID:     orderID,
			OrderItemID: it.ID,
			StoreID:     storeID,
			ExpiresAt:   accessExpiry(it.AccessValidityValue, it.AccessValidityUnit),
		})
		if err != nil {
			f.logger.Error("fulfillment: create token",
				"err", err, "order_id", orderID, "order_item_id", it.ID)
			continue
		}
		tokens = append(tokens, minted{
			token:       t.Token,
			productType: it.ProductType,
			productName: it.ProductName,
			variantName: it.VariantName,
		})
	}
	if len(tokens) == 0 {
		return
	}

	// Email the buyer. Skip if the buyer didn't supply an email (the
	// storefront enforces this for all-non-physical carts, but defensively
	// no-op here too).
	if !f.mailer.Configured() || strings.TrimSpace(order.CustomerEmail) == "" {
		return
	}

	origin := strings.TrimRight(f.webOrigin, "/")

	// Split by type: digital items point at /download/{token}; course items
	// point at the OTP-gated viewer /{slug}/course/{token}. A mixed cart gets
	// one email per kind (clearer than cramming both into one).
	var digitalLinks, courseLinks []email.DownloadLink
	for _, t := range tokens {
		name := t.productName
		if t.variantName != "" {
			name += " — " + t.variantName
		}
		if t.productType == "course" {
			courseLinks = append(courseLinks, email.DownloadLink{
				Name: name,
				URL:  origin + "/" + store.Slug + "/course/" + t.token,
			})
		} else {
			digitalLinks = append(digitalLinks, email.DownloadLink{
				Name: name,
				URL:  origin + "/download/" + t.token,
			})
		}
	}

	if len(digitalLinks) > 0 {
		subject, text, htmlBody := email.RenderDigitalDelivery(email.DigitalDeliveryData{
			StoreName:    store.Name,
			OrderNumber:  order.OrderNumber,
			CustomerName: order.CustomerName,
			Links:        digitalLinks,
		})
		f.mailer.Send(email.Message{
			To: order.CustomerEmail, ToName: order.CustomerName,
			Subject: subject, Text: text, HTML: htmlBody, Category: "digital_delivery",
		})
	}
	if len(courseLinks) > 0 {
		subject, text, htmlBody := email.RenderCourseAccess(email.CourseAccessData{
			StoreName:    store.Name,
			OrderNumber:  order.OrderNumber,
			CustomerName: order.CustomerName,
			Links:        courseLinks,
		})
		f.mailer.Send(email.Message{
			To: order.CustomerEmail, ToName: order.CustomerName,
			Subject: subject, Text: text, HTML: htmlBody, Category: "course_access",
		})
	}

	// best-effort log so seller debugging is easier
	f.logger.Info("non-physical order fulfilled",
		"order_id", orderID, "store_id", storeID,
		"digital", len(digitalLinks), "course", len(courseLinks),
		"email", order.CustomerEmail,
		"completed_at", time.Now().UTC().Format(time.RFC3339))
}
