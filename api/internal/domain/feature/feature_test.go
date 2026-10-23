package feature

import "testing"

// Pro alone unlocks nothing that is sold as an add-on. This is the whole
// premise: Bisnis features stop being a tier and start being purchases.
func TestProAloneHoldsNoAddonFeature(t *testing.T) {
	e := EntitlementsFor("pro", nil)
	for _, f := range []Feature{POS, Printer, TableQR, AIAnalytics, Membership, Loyalty} {
		if e.Has(f) {
			t.Errorf("bare Pro unlocked %q, which is sold as an add-on", f)
		}
	}
	// Pro-gated features still come with the tier.
	for _, f := range []Feature{MetaIntegration, CheckoutFields} {
		if !e.Has(f) {
			t.Errorf("Pro should include %q", f)
		}
	}
}

// Buying one add-on unlocks its features and nothing else. A seller who
// pays for the kasir must not quietly receive the AI they did not buy.
func TestAddonUnlocksOnlyItsOwnFeatures(t *testing.T) {
	e := EntitlementsFor("pro", []string{"kasir"})

	for _, f := range []Feature{POS, Printer, TableQR} {
		if !e.Has(f) {
			t.Errorf("Paket Kasir should unlock %q", f)
		}
	}
	for _, f := range []Feature{AIAnalytics, Membership, Loyalty} {
		if e.Has(f) {
			t.Errorf("Paket Kasir leaked %q", f)
		}
	}
}

// Bisnis is the bundle. It must grant every add-on feature without any row
// in store_addons, so a seller cannot end up half-entitled if one of those
// writes were to fail.
func TestBisnisGrantsEverythingWithoutAddonRows(t *testing.T) {
	e := EntitlementsFor("bisnis", nil)
	for _, f := range gatedOrder {
		if !e.Has(f) {
			t.Errorf("Bisnis should unlock %q with no add-on rows", f)
		}
	}
}

// Free holds nothing gated, with or without add-on rows. Add-ons are sold
// on top of Pro; a stale row must never become a back door.
func TestFreeHoldsNothingGatedEvenWithAddonRows(t *testing.T) {
	e := EntitlementsFor("free", []string{"kasir", "ai", "membership"})
	for _, f := range gatedOrder {
		if e.Has(f) {
			t.Errorf("Free unlocked %q", f)
		}
	}
}

// A retired add-on stops granting access rather than breaking the request.
func TestUnknownAddonCodeIsIgnored(t *testing.T) {
	e := EntitlementsFor("pro", []string{"kasir", "sudah_dihapus"})
	if !e.Has(POS) {
		t.Error("a known add-on stopped working because an unknown one was present")
	}
	if len(e.Addons) != 1 {
		t.Errorf("unknown code was kept: %v", e.Addons)
	}
}

// Every gated feature must belong to exactly one add-on or be Pro-gated.
// A feature in neither bucket is silently free — which is how a paid
// feature escapes without anyone noticing.
func TestEveryGatedFeatureIsSoldSomehow(t *testing.T) {
	free := EntitlementsFor("free", nil)
	for _, f := range gatedOrder {
		_, inAddon := addonOf[f]
		if !inAddon && !proOnly[f] {
			t.Errorf("%q is in gatedOrder but belongs to no add-on and no tier", f)
		}
		if free.Has(f) {
			t.Errorf("%q is listed as gated but Free can use it", f)
		}
	}
}

// No feature may appear in two add-ons: a seller would pay twice for it,
// and cancelling one package would not take it away.
func TestNoFeatureIsSoldTwice(t *testing.T) {
	seen := map[Feature]Addon{}
	for a, fs := range addonFeatures {
		for _, f := range fs {
			if prev, dup := seen[f]; dup {
				t.Errorf("%q is sold in both %q and %q", f, prev, a)
			}
			seen[f] = a
		}
	}
}

// Granted drives what the frontend shows. It must agree with Has, or the
// UI offers something the API then refuses.
func TestGrantedAgreesWithHas(t *testing.T) {
	for _, e := range []Entitlements{
		EntitlementsFor("free", nil),
		EntitlementsFor("pro", nil),
		EntitlementsFor("pro", []string{"kasir"}),
		EntitlementsFor("pro", []string{"kasir", "ai", "membership"}),
		EntitlementsFor("bisnis", nil),
	} {
		granted := map[string]bool{}
		for _, g := range e.Granted() {
			granted[g] = true
		}
		for _, f := range gatedOrder {
			if granted[string(f)] != e.Has(f) {
				t.Errorf("plan=%s addons=%v: Granted and Has disagree on %q",
					e.Plan, e.Addons, f)
			}
		}
	}
}

// The upsell has to name the right thing to buy.
func TestMissingNamesTheAddonToBuy(t *testing.T) {
	e := EntitlementsFor("pro", []string{"ai"})

	if a, ok := e.Missing(POS); !ok || a != AddonKasir {
		t.Errorf("Missing(POS) = %q,%v; want kasir,true", a, ok)
	}
	// Already held, so nothing to sell.
	if _, ok := e.Missing(AIAnalytics); ok {
		t.Error("Missing named an add-on for a feature the store already has")
	}
	// Pro-gated, not an add-on.
	if _, ok := e.Missing(MetaIntegration); ok {
		t.Error("Missing named an add-on for a Pro-gated feature")
	}
}

// Buying all three must equal Bisnis exactly. If they ever diverge, the
// bundle is either cheating buyers or giving something away.
func TestAllThreeAddonsEqualBisnis(t *testing.T) {
	all := EntitlementsFor("pro", []string{"kasir", "ai", "membership"})
	bisnis := EntitlementsFor("bisnis", nil)
	for _, f := range gatedOrder {
		if all.Has(f) != bisnis.Has(f) {
			t.Errorf("%q: all add-ons = %v but Bisnis = %v",
				f, all.Has(f), bisnis.Has(f))
		}
	}
}
