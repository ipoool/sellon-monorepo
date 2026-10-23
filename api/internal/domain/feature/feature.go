// Package feature is the single source of truth for subscription feature
// gating — what a store may use, given its plan and the add-ons it bought.
// Used by both the RequireFeature middleware (backend enforcement) and the
// features list returned to the frontend via /api/v1/subscription.
package feature

type Feature string

const (
	POS             Feature = "pos"
	AIAnalytics     Feature = "ai_analytics"
	Printer         Feature = "printer"
	CheckoutFields  Feature = "checkout_fields"
	TableQR         Feature = "table_qr"
	Membership      Feature = "membership"
	Loyalty         Feature = "loyalty"
	MetaIntegration Feature = "meta_integration"
)

// Addon is a purchasable bundle of features, sold on top of Pro.
type Addon string

const (
	AddonKasir      Addon = "kasir"
	AddonAI         Addon = "ai"
	AddonMembership Addon = "membership"
)

// AddonOrder is the stable display order. Maps are unordered, and a pricing
// page whose rows move between reloads looks broken.
var AddonOrder = []Addon{AddonKasir, AddonAI, AddonMembership}

// addonFeatures is what each add-on contains.
//
// Deliberately in code rather than beside the price in the `addons` table.
// Price is a pricing decision an admin should be able to change without a
// deploy; which features make up a package is a product decision, and a
// feature list an admin can edit next to the Go map that enforces it is
// exactly how the two drift apart — a bug this repo has already paid for
// once with a CHECK constraint and its Go allowlist.
//
// Features are grouped by what a seller actually buys. POS without a
// receipt printer is not a cheaper kasir, it is a broken one, so they ship
// together rather than as two SKUs that can be bought wrong.
var addonFeatures = map[Addon][]Feature{
	AddonKasir:      {POS, Printer, TableQR},
	AddonAI:         {AIAnalytics},
	AddonMembership: {Membership, Loyalty},
}

// addonOf is the reverse lookup: which add-on unlocks a feature. Built once
// at init so a gated request is a map read, not a scan.
var addonOf = func() map[Feature]Addon {
	m := make(map[Feature]Addon)
	for a, fs := range addonFeatures {
		for _, f := range fs {
			m[f] = a
		}
	}
	return m
}()

// proOnly lists features unlocked from the Pro tier upward, with no add-on
// to buy. CheckoutFields sits here rather than in a package because custom
// checkout fields are storefront polish, and Pro is the storefront tier —
// folding it into Kasir or Membership would have been filing, not grouping.
var proOnly = map[Feature]bool{
	MetaIntegration: true,
	CheckoutFields:  true,
}

// gatedOrder is the stable iteration order for Granted.
var gatedOrder = []Feature{
	POS, AIAnalytics, Printer, CheckoutFields, TableQR,
	Membership, Loyalty, MetaIntegration,
}

// AddonFeatures returns what an add-on contains, for display.
func AddonFeatures(a Addon) []Feature { return addonFeatures[a] }

// RequiresAddon reports whether f is sold as part of an add-on, and which.
func RequiresAddon(f Feature) (Addon, bool) {
	a, ok := addonOf[f]
	return a, ok
}

// Entitlements is everything a store may use: its plan, plus the add-ons it
// is currently paying for.
//
// Resolved once per request from the subscription and store_addons, then
// asked. The old API took a bare plan string, which worked only while a
// tier was the whole answer.
type Entitlements struct {
	Plan   string
	Addons map[Addon]bool
}

// EntitlementsFor builds the set from a plan and the add-on codes a store
// holds. Unknown codes are ignored rather than rejected: a retired add-on
// should stop granting access, not break every request the store makes.
func EntitlementsFor(plan string, addonCodes []string) Entitlements {
	e := Entitlements{Plan: plan, Addons: make(map[Addon]bool, len(addonCodes))}
	for _, c := range addonCodes {
		a := Addon(c)
		if _, known := addonFeatures[a]; known {
			e.Addons[a] = true
		}
	}
	return e
}

// Has reports whether the store may use f.
func (e Entitlements) Has(f Feature) bool {
	if proOnly[f] {
		return e.Plan == "pro" || e.Plan == "bisnis"
	}
	a, gated := addonOf[f]
	if !gated {
		// Not sold separately and not Pro-gated: available to everyone.
		return true
	}
	// Bisnis IS the bundle — every add-on, one price. Keeping that here
	// rather than writing three rows into store_addons at upgrade time
	// means a Bisnis seller cannot end up half-entitled if one of those
	// writes fails.
	if e.Plan == "bisnis" {
		return true
	}
	// Add-ons are sold ON TOP OF Pro, so the row alone is not enough. A
	// store_addons row outlives the subscription that paid for it: when a
	// period lapses the plan falls back to free while the rows remain, and
	// without this check that lapse would hand the features over for
	// nothing.
	if e.Plan != "pro" {
		return false
	}
	return e.Addons[a]
}

// Granted returns the gated features this store unlocks, as strings —
// surfaced to the frontend so it can hide or lock UI without duplicating
// the map.
func (e Entitlements) Granted() []string {
	out := make([]string, 0, len(gatedOrder))
	for _, f := range gatedOrder {
		if e.Has(f) {
			out = append(out, string(f))
		}
	}
	return out
}

// Missing returns the add-on a store would have to buy to use f, or false
// when f is not an add-on feature (free, Pro-gated, or already held).
func (e Entitlements) Missing(f Feature) (Addon, bool) {
	if e.Has(f) {
		return "", false
	}
	a, gated := addonOf[f]
	return a, gated
}

// MinTier returns the lowest plan that can hold f at all. Add-on features
// need Pro, because add-ons are sold on top of it.
func MinTier(f Feature) string {
	if proOnly[f] {
		return "pro"
	}
	if _, gated := addonOf[f]; gated {
		return "pro"
	}
	return "free"
}
