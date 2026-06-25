package scheduler

import (
	"context"
	"log/slog"
	"time"

	"github.com/sellon/sellon/api/internal/repository"
)

// OrderExpiryJob auto-cancels stale 'pending'/'unpaid' orders (with no payment
// proof uploaded) older than ttl, releasing their stock + digital kuota + promo
// allocation. Ticks every 30 minutes. main only starts it when ttl > 0.
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

func (j *OrderExpiryJob) run(ctx context.Context) {
	cutoff := time.Now().Add(-j.ttl)
	n, err := j.orders.ExpireStaleUnpaid(ctx, cutoff)
	if err != nil {
		j.logger.Error("scheduler: order expiry failed", "err", err)
		return
	}
	if n > 0 {
		j.logger.Info("scheduler: expired stale unpaid orders",
			"count", n, "cutoff", cutoff.Format(time.RFC3339))
	}
}
