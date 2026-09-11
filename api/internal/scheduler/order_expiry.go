package scheduler

import (
	"context"
	"log/slog"
	"time"

	"github.com/sellon/sellon/api/internal/repository"
)

// OrderExpiryJob auto-cancels abandoned orders (no payment proof uploaded),
// releasing their stock + digital kuota + promo allocation + the customer
// lifetime totals checkout had already counted. Orders the buyer never acted
// on expire after ttl; ones parked at payment_status='pending' get at least
// pendingGrace. Ticks every 30 minutes. main only starts it when ttl > 0.
type OrderExpiryJob struct {
	orders *repository.OrderRepo
	ttl    time.Duration
	logger *slog.Logger
}

func NewOrderExpiryJob(orders *repository.OrderRepo, ttl time.Duration, logger *slog.Logger) *OrderExpiryJob {
	return &OrderExpiryJob{orders: orders, ttl: ttl, logger: logger}
}

// Start runs the job in the background. Cancel ctx to stop cleanly.
func (j *OrderExpiryJob) Start(ctx context.Context) {
	go j.loop(ctx)
}

func (j *OrderExpiryJob) loop(ctx context.Context) {
	j.logger.Info("scheduler: order expiry job started", "ttl_hours", j.ttl.Hours())

	// Run once shortly after boot so a fresh deploy clears any backlog without
	// waiting a full tick.
	runCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	j.run(runCtx)
	cancel()

	ticker := time.NewTicker(30 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			j.logger.Info("scheduler: order expiry job stopped")
			return
		case <-ticker.C:
			runCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
			j.run(runCtx)
			cancel()
		}
	}
}

// pendingGrace is the minimum age before an order parked at
// payment_status='pending' is expired. A pending order means a real payment
// instrument exists — an issued Midtrans VA, or a buyer who pressed "saya
// sudah bayar" — so it deserves more patience than one the buyer never
// touched. 24 hours matches the longest Midtrans VA lifetime, so we never
// cancel a charge the gateway itself still considers payable.
const pendingGrace = 24 * time.Hour

func (j *OrderExpiryJob) run(ctx context.Context) {
	now := time.Now()
	unpaidCutoff := now.Add(-j.ttl)
	pendingCutoff := now.Add(-max(j.ttl, pendingGrace))
	n, err := j.orders.ExpireStaleUnpaid(ctx, unpaidCutoff, pendingCutoff)
	if err != nil {
		j.logger.Error("scheduler: order expiry failed", "err", err)
		return
	}
	if n > 0 {
		j.logger.Info("scheduler: expired stale unpaid orders",
			"count", n,
			"unpaid_cutoff", unpaidCutoff.Format(time.RFC3339),
			"pending_cutoff", pendingCutoff.Format(time.RFC3339))
	}
}
