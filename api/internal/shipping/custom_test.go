package shipping

import "testing"

func names(rs []CustomRate) []string {
	out := make([]string, 0, len(rs))
	for _, r := range rs {
		out = append(out, r.Name)
	}
	return out
}

func eq(t *testing.T, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range got {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
}

// The shape from the founder's own example: a near rate, a far rate, a
// catch-all, and pickup that is available wherever the buyer lives.
func fixture() []CustomRate {
	return []CustomRate{
		{ID: "1", Name: "Kurir Toko", PriceCents: 1_000_000,
			Areas: []string{"bandung", "cimahi"}},
		{ID: "2", Name: "Kurir Toko (jauh)", PriceCents: 2_000_000,
			Areas: []string{"jakarta", "bekasi", "depok"}},
		{ID: "3", Name: "Luar area", PriceCents: 3_500_000, IsFallback: true},
		{ID: "4", Name: "Ambil di toko", PriceCents: 0},
	}
}

func TestCustomRateNamedAreaBeatsFallback(t *testing.T) {
	got := names(MatchCustomRates(fixture(), "Bandung"))
	eq(t, got, []string{"Kurir Toko", "Ambil di toko"})
}

func TestCustomRateUnnamedCityGetsFallback(t *testing.T) {
	got := names(MatchCustomRates(fixture(), "Makassar"))
	eq(t, got, []string{"Luar area", "Ambil di toko"})
}

// "Kab. Bandung", "KOTA BANDUNG" and "bandung" are one area. A seller who
// typed one spelling must not lose buyers who typed another.
func TestCustomRateAreaMatchIsNormalised(t *testing.T) {
	for _, city := range []string{"bandung", "Bandung", "KOTA BANDUNG",
		"Kabupaten Bandung", "Kab. Bandung", "  Bandung  "} {
		got := names(MatchCustomRates(fixture(), city))
		eq(t, got, []string{"Kurir Toko", "Ambil di toko"})
	}
}

// A second city on the same rate must work, or only the first listed area
// would ever match.
func TestCustomRateMatchesAnyListedArea(t *testing.T) {
	eq(t, names(MatchCustomRates(fixture(), "Cimahi")),
		[]string{"Kurir Toko", "Ambil di toko"})
	eq(t, names(MatchCustomRates(fixture(), "Depok")),
		[]string{"Kurir Toko (jauh)", "Ambil di toko"})
}

// An empty city means the buyer has not said where they are yet. Offering
// the fallback is the honest answer; offering nothing would render an
// empty courier list on a store that does deliver everywhere.
func TestCustomRateEmptyCityFallsBack(t *testing.T) {
	eq(t, names(MatchCustomRates(fixture(), "")),
		[]string{"Luar area", "Ambil di toko"})
}

// Without a fallback, an unserved city gets only the everywhere rates —
// never a silent substitution of some other area's price.
func TestCustomRateNoFallbackLeavesOnlyEverywhereRates(t *testing.T) {
	rates := []CustomRate{
		{ID: "1", Name: "Kurir Toko", PriceCents: 1_000_000, Areas: []string{"bandung"}},
		{ID: "4", Name: "Ambil di toko", PriceCents: 0},
	}
	eq(t, names(MatchCustomRates(rates, "Makassar")), []string{"Ambil di toko"})

	only := []CustomRate{rates[0]}
	if got := MatchCustomRates(only, "Makassar"); len(got) != 0 {
		t.Fatalf("expected no options, got %v", names(got))
	}
}

func TestCustomCodeRoundTrips(t *testing.T) {
	if id := CustomRateID(CustomCode("abc-123")); id != "abc-123" {
		t.Fatalf("round trip gave %q", id)
	}
	if id := CustomRateID("jne"); id != "" {
		t.Fatalf("courier code read as a custom rate: %q", id)
	}
}
