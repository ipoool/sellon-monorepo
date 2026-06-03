package handler

import (
	"fmt"
	"html"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/domain/feature"
	"github.com/sellon/sellon/api/internal/repository"
)

// Meta (Facebook) product catalog feed — RSS 2.0 + Google Merchant `g:` namespace,
// the format Meta Commerce Manager accepts as a scheduled data source. PUBLIC
// (Meta crawls it, no auth). Only active, physical products are listed; digital
// products are excluded (not advertisable as shippable goods). The item `id`
// equals the product UUID so it matches the `content_ids` sent in Pixel/CAPI
// events, which is what lets Meta attribute per-product sales.
//
// The XML is built by hand rather than via encoding/xml: Go's encoder does not
// support namespace-prefixed element names (struct tags like `xml:"g:id"`
// produce invalid `xmlns:g=""` declarations — "Empty XML namespace is not
// allowed"). Manual building with proper escaping is the reliable approach.

const metaFeedHeader = `<?xml version="1.0" encoding="UTF-8"?>` + "\n"
const metaGNS = "http://base.google.com/ns/1.0"

func metaEsc(s string) string { return html.EscapeString(s) }

// GET /api/v1/storefront/{slug}/meta-feed.xml
// The {slug} param accepts EITHER the store UUID (the stable, registered feed
// URL — see MetaHandler.feedURL) OR the human slug (back-compat). The store
// UUID is preferred so a future slug rename never breaks the registered feed.
func (h *StorefrontHandler) MetaFeed(w http.ResponseWriter, r *http.Request) {
	ref := chi.URLParam(r, "slug")
	var store *repository.Store
	var err error
	if id, perr := uuid.Parse(ref); perr == nil {
		store, err = h.stores.FindByID(r.Context(), id)
	} else {
		store, err = h.stores.FindBySlug(r.Context(), ref)
	}
	if err != nil {
		// Empty 200 so Meta doesn't flag the data source as broken / leak existence.
		writeEmptyFeed(w)
		return
	}

	// Re-check plan: a store that enabled Meta then downgraded must stop
	// serving the catalog feed (mirrors the seller-banner public-leak fix).
	// Fail open on a lookup error so a paying store never goes dark on a blip.
	if !store.MetaEnabled {
		writeEmptyFeed(w)
		return
	}
	if plan, perr := h.subs.GetPlan(r.Context(), store.ID); perr == nil && !feature.HasFeature(plan, feature.MetaIntegration) {
		writeEmptyFeed(w)
		return
	}

	prods, err := h.products.ListActiveByStore(r.Context(), store.ID)
	if err != nil {
		h.logger.Error("meta feed list products", "err", err)
		writeEmptyFeed(w)
		return
	}

	base := strings.TrimRight(h.webOrigin, "/")
	brand := store.Name

	var b strings.Builder
	b.WriteString(metaFeedHeader)
	b.WriteString(`<rss version="2.0" xmlns:g="` + metaGNS + `">` + "\n")
	b.WriteString("  <channel>\n")
	b.WriteString("    <title>" + metaEsc(store.Name) + "</title>\n")
	b.WriteString("    <link>" + metaEsc(base+"/"+store.Slug) + "</link>\n")
	b.WriteString("    <description>" + metaEsc("Katalog produk "+store.Name) + "</description>\n")

	for i := range prods {
		p := &prods[i]
		// Catalog ads point to shippable goods; skip digital products.
		if p.ProductType == "digital" {
			continue
		}
		avail := "out of stock"
		if p.Stock > 0 {
			avail = "in stock"
		}
		desc := strings.TrimSpace(p.Description)
		if desc == "" {
			desc = p.Name
		}

		b.WriteString("    <item>\n")
		b.WriteString("      <g:id>" + metaEsc(p.ID.String()) + "</g:id>\n")
		b.WriteString("      <g:title>" + metaEsc(p.Name) + "</g:title>\n")
		b.WriteString("      <g:description>" + metaEsc(desc) + "</g:description>\n")
		b.WriteString("      <g:link>" + metaEsc(fmt.Sprintf("%s/%s/product/%s", base, store.Slug, p.Slug)) + "</g:link>\n")
		if len(p.PhotoURLs) > 0 && p.PhotoURLs[0] != "" {
			b.WriteString("      <g:image_link>" + metaEsc(p.PhotoURLs[0]) + "</g:image_link>\n")
			// Meta caps additional images at 20.
			rest := p.PhotoURLs[1:]
			if len(rest) > 20 {
				rest = rest[:20]
			}
			for _, u := range rest {
				if u == "" {
					continue
				}
				b.WriteString("      <g:additional_image_link>" + metaEsc(u) + "</g:additional_image_link>\n")
			}
		}
		b.WriteString("      <g:availability>" + avail + "</g:availability>\n")
		b.WriteString("      <g:condition>new</g:condition>\n")
		b.WriteString("      <g:price>" + fmt.Sprintf("%.2f IDR", float64(p.PriceCents)/100) + "</g:price>\n")
		b.WriteString("      <g:brand>" + metaEsc(brand) + "</g:brand>\n")
		if g := strings.TrimSpace(p.GTIN); g != "" {
			b.WriteString("      <g:gtin>" + metaEsc(g) + "</g:gtin>\n")
		}
		b.WriteString("    </item>\n")
	}

	b.WriteString("  </channel>\n")
	b.WriteString("</rss>\n")

	writeXML(w, b.String())
}

// writeEmptyFeed serves a valid but empty catalog (store not found, Meta
// disabled, or downgraded out of the feature).
func writeEmptyFeed(w http.ResponseWriter) {
	writeXML(w, metaFeedHeader+
		`<rss version="2.0" xmlns:g="`+metaGNS+`">`+"\n"+
		"  <channel>\n    <title>Katalog</title>\n  </channel>\n</rss>\n")
}

func writeXML(w http.ResponseWriter, body string) {
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	// Meta re-fetches on a schedule; allow brief caching.
	w.Header().Set("Cache-Control", "public, max-age=600")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(body))
}
