package handler

import (
	"strings"
	"testing"
)

// "Harga coret": the pre-discount price a seller sets so the storefront can
// show Rp 90.000 against a struck-through Rp 100.000.
func TestCompareAtPriceAcceptsARealDiscount(t *testing.T) {
	out, err := productInput{
		Name:                "Kaos Polos",
		PriceCents:          9000000,
		CompareAtPriceCents: 10000000,
		Status:              "active",
	}.sanitize()
	if err != nil {
		t.Fatalf("a genuine discount should be accepted: %v", err)
	}
	if out.CompareAtPriceCents != 10000000 {
		t.Fatalf("compare-at not carried through: %d", out.CompareAtPriceCents)
	}
}

// 0 is how a seller turns the strike off, and it is what every product
// carries before they touch the field.
func TestCompareAtPriceZeroMeansNoDiscount(t *testing.T) {
	out, err := productInput{
		Name: "Kaos Polos", PriceCents: 9000000, Status: "active",
	}.sanitize()
	if err != nil {
		t.Fatalf("no compare-at should be fine: %v", err)
	}
	if out.CompareAtPriceCents != 0 {
		t.Fatalf("want 0, got %d", out.CompareAtPriceCents)
	}
}

// A value at or below the real price is not a discount. Storing it would
// render a strike that advertises no saving, and the seller would never learn
// their input was being ignored by the display rule.
func TestCompareAtPriceRejectsNonDiscounts(t *testing.T) {
	for _, tc := range []struct {
		name       string
		price      int64
		compareAt  int64
		wantErrSub string
	}{
		{"below the real price", 9000000, 5000000, "lebih besar"},
		{"equal to the real price", 9000000, 9000000, "lebih besar"},
		{"negative", 9000000, -100, "negatif"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := productInput{
				Name: "Kaos Polos", PriceCents: tc.price,
				CompareAtPriceCents: tc.compareAt, Status: "active",
			}.sanitize()
			if err == nil {
				t.Fatalf("want rejection for %s", tc.name)
			}
			if !strings.Contains(err.Error(), tc.wantErrSub) {
				t.Errorf("error should say why, got %q", err.Error())
			}
		})
	}
}
