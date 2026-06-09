package fulfillment

import (
	"testing"
	"time"
)

// TestAccessExpiry verifies the course "masa aktif" → token expiry mapping:
// lifetime/zero/invalid → nil (no expiry); week/month/year → a calendar-correct
// future time. Calendar math matters (month/year aren't fixed days), so we
// compare against time.AddDate rather than a day count.
func TestAccessExpiry(t *testing.T) {
	// No expiry: lifetime, zero/negative value, or unrecognized unit.
	noExpiry := []struct {
		value int
		unit  string
	}{
		{0, "lifetime"},
		{3, "lifetime"},
		{0, "month"},
		{-1, "year"},
		{5, "decade"}, // not a valid unit
		{2, ""},
	}
	for _, c := range noExpiry {
		if got := accessExpiry(c.value, c.unit); got != nil {
			t.Errorf("accessExpiry(%d, %q) = %v, want nil", c.value, c.unit, *got)
		}
	}

	// Positive ranges: expect ~now + duration (1-minute tolerance for the
	// time.Now() taken inside accessExpiry vs the one taken here).
	const tol = time.Minute
	cases := []struct {
		value int
		unit  string
		want  func(time.Time) time.Time
	}{
		{2, "week", func(n time.Time) time.Time { return n.AddDate(0, 0, 14) }},
		{3, "month", func(n time.Time) time.Time { return n.AddDate(0, 3, 0) }},
		{1, "year", func(n time.Time) time.Time { return n.AddDate(1, 0, 0) }},
	}
	for _, c := range cases {
		now := time.Now()
		got := accessExpiry(c.value, c.unit)
		if got == nil {
			t.Errorf("accessExpiry(%d, %q) = nil, want non-nil", c.value, c.unit)
			continue
		}
		want := c.want(now)
		if diff := got.Sub(want); diff > tol || diff < -tol {
			t.Errorf("accessExpiry(%d, %q) = %v, want ~%v (diff %v)", c.value, c.unit, *got, want, diff)
		}
	}
}
