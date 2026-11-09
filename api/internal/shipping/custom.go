package shipping

import "strings"

// CustomRate is a seller-defined ongkir option, as the matcher needs it.
// Deliberately not the repository row: this package must stay free of a
// database dependency so the rule can be unit-tested on plain values.
type CustomRate struct {
	ID         string
	Name       string
	PriceCents int64
	ETA        string
	// Normalised city names this rate serves. Empty means "everywhere".
	Areas      []string
	IsFallback bool
}

// NormalizeArea canonicalises a city name for storage and for matching.
// Exported so the settings handler stores exactly what the matcher will
// later compare against — the two drifting apart is how a seller ends up
// with a rate that silently never matches.
func NormalizeArea(s string) string { return normalize(s) }

// MatchCustomRates returns the rates offered to a buyer in `buyerCity`.
//
// The rule, in order:
//
//  1. Rates naming this city win. If any exist, the fallback stays out —
//     "semua area lain" means exactly that.
//  2. Rates with no areas are always offered. That is how in-store pickup
//     is expressed: collecting in person does not depend on where the
//     buyer lives.
//  3. The fallback is offered only when no rate named this city.
//
// Order within the result follows the caller's slice, which the repository
// returns in the seller's own sort order.
func MatchCustomRates(rates []CustomRate, buyerCity string) []CustomRate {
	city := normalize(buyerCity)

	named := false
	for _, r := range rates {
		if len(r.Areas) > 0 && areaContains(r.Areas, city) {
			named = true
			break
		}
	}

	out := make([]CustomRate, 0, len(rates))
	for _, r := range rates {
		switch {
		case r.IsFallback:
			// Only when nothing else claimed this city. A buyer whose city
			// is blank has not told us where they are, so the fallback is
			// the honest answer rather than nothing at all.
			if !named {
				out = append(out, r)
			}
		case len(r.Areas) == 0:
			out = append(out, r)
		case areaContains(r.Areas, city):
			out = append(out, r)
		}
	}
	return out
}

func areaContains(areas []string, city string) bool {
	if city == "" {
		return false
	}
	for _, a := range areas {
		if a == city {
			return true
		}
	}
	return false
}

// CustomCode is the option code carried to the buyer and back. Prefixed so
// the checkout can tell a seller rate from a courier, and carries the row
// id so the order path can verify the price the buyer sent.
func CustomCode(id string) string { return "custom:" + id }

// CustomRateID reverses CustomCode. Empty when the code is not a seller
// rate.
func CustomRateID(code string) string {
	if !strings.HasPrefix(code, "custom:") {
		return ""
	}
	return strings.TrimPrefix(code, "custom:")
}
