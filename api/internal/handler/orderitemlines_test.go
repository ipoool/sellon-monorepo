package handler

import (
	"strings"
	"testing"

	"github.com/sellon/sellon/api/internal/repository"
)

// A seller selling shirts makes "Ukuran" a required option. Both order emails
// listed only the product name, so the one detail needed to pack the parcel
// was the one detail missing.
func TestOrderItemLinesIncludesChosenOptions(t *testing.T) {
	got := orderItemLines([]repository.OrderItemInput{{
		ProductName: "Aceh Sabit",
		UnitCents:   13900000,
		Quantity:    1,
		Modifiers: []repository.OptionSnapshot{
			{GroupName: "Ukuran", OptionName: "L"},
		},
	}})

	if !strings.Contains(got, "1× Aceh Sabit") {
		t.Errorf("product line missing:\n%s", got)
	}
	if !strings.Contains(got, "Ukuran: L") {
		t.Errorf("chosen option missing — this is the bug:\n%s", got)
	}
	// The option belongs to the line above it, not to a second product.
	lines := strings.Split(got, "\n")
	if len(lines) != 2 || !strings.HasPrefix(lines[1], "   ") {
		t.Errorf("option should be an indented continuation line, got %q", got)
	}
}

// Several groups on one line, plus a variant, plus a second product — the
// shape a real cart takes.
func TestOrderItemLinesHandlesVariantsAndMultipleGroups(t *testing.T) {
	got := orderItemLines([]repository.OrderItemInput{
		{
			ProductName: "Kaos Polos",
			VariantName: "Hitam",
			UnitCents:   10000000,
			Quantity:    2,
			Modifiers: []repository.OptionSnapshot{
				{GroupName: "Ukuran", OptionName: "XL"},
				{GroupName: "Lengan", OptionName: "Panjang"},
			},
		},
		{ProductName: "Totebag", UnitCents: 3900000, Quantity: 1},
	})

	for _, want := range []string{"2× Kaos Polos (Hitam)", "Ukuran: XL", "Lengan: Panjang", "1× Totebag"} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %q in:\n%s", want, got)
		}
	}
	// A product with no options must not gain a stray blank line.
	if strings.Contains(got, "\n\n") {
		t.Errorf("blank line in summary:\n%s", got)
	}
}

// An option with no group name still renders, without a dangling separator.
func TestOrderItemLinesToleratesGrouplessOption(t *testing.T) {
	got := orderItemLines([]repository.OrderItemInput{{
		ProductName: "Kopi",
		UnitCents:   2500000,
		Quantity:    1,
		Modifiers:   []repository.OptionSnapshot{{OptionName: "Extra shot"}},
	}})
	if !strings.Contains(got, "Extra shot") {
		t.Errorf("groupless option dropped:\n%s", got)
	}
	if strings.Contains(got, ": Extra shot") {
		t.Errorf("dangling separator on a groupless option:\n%s", got)
	}
}
