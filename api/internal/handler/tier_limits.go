package handler

// Tier limits source-of-truth. Update with /landing/pricing.tsx if you
// change the marketing copy.
//
// -1 means unlimited.
const (
	freeProductLimit   = 30
	proProductLimit    = -1
	bisnisProductLimit = -1
)

// productLimitForPlan returns -1 when the plan has no cap.
func productLimitForPlan(plan string) int {
	switch plan {
	case "pro":
		return proProductLimit
	case "bisnis":
		return bisnisProductLimit
	default:
		return freeProductLimit
	}
}

// Staff seat caps (includes the owner). Free=1 means owner only.
const (
	freeStaffLimit   = 1
	proStaffLimit    = 5
	bisnisStaffLimit = -1
)

func staffLimitForPlan(plan string) int {
	switch plan {
	case "pro":
		return proStaffLimit
	case "bisnis":
		return bisnisStaffLimit
	default:
		return freeStaffLimit
	}
}

// Orders/month caps for the storefront create flow. -1 = unlimited.
// "Month" is calendar-month at server-time UTC; close enough for now.
const (
	freeOrderLimit   = 50
	proOrderLimit    = -1
	bisnisOrderLimit = -1
)

func orderLimitForPlan(plan string) int {
	switch plan {
	case "pro":
		return proOrderLimit
	case "bisnis":
		return bisnisOrderLimit
	default:
		return freeOrderLimit
	}
}
