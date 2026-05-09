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
