// Package feature is the single source of truth for subscription feature
// gating — which plan tier unlocks which feature. Used by both the
// RequireFeature middleware (backend enforcement) and the features list
// returned to the frontend via /api/v1/subscription.
package feature

type Feature string

const (
	POS            Feature = "pos"
	AIAnalytics    Feature = "ai_analytics"
	Printer        Feature = "printer"
	CheckoutFields Feature = "checkout_fields"
	TableQR        Feature = "table_qr"
	Membership     Feature = "membership"
	Loyalty        Feature = "loyalty"
)

// bisnisOnly lists features exclusive to the Bisnis tier. A feature NOT in this
// map is available to every plan.
var bisnisOnly = map[Feature]bool{
	POS:            true,
	AIAnalytics:    true,
	Printer:        true,
	CheckoutFields: true,
	TableQR:        true,
	Membership:     true,
	Loyalty:        true,
}

// gatedOrder is the stable iteration order for ForPlan (maps are unordered).
var gatedOrder = []Feature{
	POS, AIAnalytics, Printer, CheckoutFields, TableQR, Membership, Loyalty,
}

// HasFeature reports whether the given plan tier unlocks feature f.
func HasFeature(plan string, f Feature) bool {
	if bisnisOnly[f] {
		return plan == "bisnis"
	}
	return true
}

// ForPlan returns the gated features the plan unlocks, as strings — surfaced to
// the frontend so it can hide/lock UI without hard-coding the tier map twice.
func ForPlan(plan string) []string {
	out := make([]string, 0, len(gatedOrder))
	for _, f := range gatedOrder {
		if HasFeature(plan, f) {
			out = append(out, string(f))
		}
	}
	return out
}
