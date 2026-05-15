package handler

import (
	"github.com/sellon/sellon/api/internal/repository"
)

// Tier limits read from each subscription's own snapshot. The snapshot
// is set at the time of the last plan CHANGE (decision 2026-05-10), so
// admin edits to the `plans` table only affect *new* subscriptions —
// existing subscribers keep the limits they signed up under until they
// change tier.
//
// nil-receiver fail-open: if for any reason the caller hands us a nil
// subscription, return -1 (unlimited) rather than blocking the action.

func productLimitForSub(sub *repository.Subscription) int {
	if sub == nil {
		return -1
	}
	return sub.ProductLimit
}

func staffLimitForSub(sub *repository.Subscription) int {
	if sub == nil {
		return -1
	}
	return sub.StaffLimit
}

func orderLimitForSub(sub *repository.Subscription) int {
	if sub == nil {
		return -1
	}
	return sub.OrderMonthlyLimit
}

func promoLimitForSub(sub *repository.Subscription) int {
	if sub == nil {
		return -1
	}
	return sub.PromoLimit
}
