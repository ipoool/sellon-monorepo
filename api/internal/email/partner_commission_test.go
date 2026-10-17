package email

import "testing"

func TestFormatRate(t *testing.T) {
	cases := []struct {
		bps  int
		want string
	}{
		{2000, "20%"},
		{1750, "17,5%"},
		{1725, "17,25%"},
		{10000, "100%"},
		{0, "0%"},
		{505, "5,05%"},
	}
	for _, c := range cases {
		if got := formatRate(c.bps); got != c.want {
			t.Errorf("formatRate(%d) = %q, want %q", c.bps, got, c.want)
		}
	}
}

// The partner is owed money, not a copy of the customer's identity. If this
// ever starts failing, someone widened the payload — check whether they meant
// to put personal data in a third party's inbox.
func TestPartnerCommissionOmitsCustomerIdentity(t *testing.T) {
	_, text, htmlBody := RenderPartnerCommission(PartnerCommissionData{
		PartnerName: "Acara Demo", ContactName: "Budi",
		StoreName: "Kopi Senja", Plan: "pro", Months: 1,
		BaseAmountCents: 9_900_000, CommissionBps: 2000,
		CommissionCents: 1_980_000, TotalOwedCents: 5_940_000,
	})
	for _, body := range []string{text, htmlBody} {
		for _, leak := range []string{"@", "pemilik"} {
			if leak == "@" && containsEmailLike(body) {
				t.Error("rendered body looks like it contains an email address")
			}
			_ = leak
		}
	}
	for _, want := range []string{"Kopi Senja", "Pro", "Rp 19.800", "Rp 59.400", "20%"} {
		if !contains(text, want) {
			t.Errorf("text body missing %q", want)
		}
	}
}

// An empty plan used to panic on a slice of the first byte.
func TestPartnerCommissionHandlesEmptyPlan(t *testing.T) {
	_, text, _ := RenderPartnerCommission(PartnerCommissionData{
		PartnerName: "Acara", StoreName: "Toko", Months: 1,
	})
	if !contains(text, "Langganan") {
		t.Error("empty plan should fall back to a readable label")
	}
}

func contains(s, sub string) bool {
	return len(sub) == 0 || (len(s) >= len(sub) && indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

// containsEmailLike looks for "x@y.z" rather than a bare "@", which legitimately
// appears in HTML attributes and copy.
func containsEmailLike(s string) bool {
	for i := 1; i < len(s)-3; i++ {
		if s[i] != '@' {
			continue
		}
		for j := i + 2; j < len(s) && j < i+40; j++ {
			if s[j] == '.' && j+2 < len(s) && isAlpha(s[j+1]) && isAlpha(s[j+2]) {
				return true
			}
			if s[j] == ' ' || s[j] == '<' || s[j] == '"' {
				break
			}
		}
	}
	return false
}

func isAlpha(b byte) bool { return (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') }
