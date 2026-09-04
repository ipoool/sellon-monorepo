package scheduler

import (
	"context"
	"log/slog"
	"time"

	"github.com/sellon/sellon/api/internal/email"
	"github.com/sellon/sellon/api/internal/repository"
)

// SubscriptionExpiryJob sends personalized expiry emails at H-3 and H-0
// before a paid subscription ends. It ticks every hour and is idempotent —
// the subscription_expiry_emails table deduplicates sends per (store, type, period).
type SubscriptionExpiryJob struct {
	subs    *repository.SubscriptionRepo
	reports *repository.ReportsRepo
	mailer  *email.Mailer
	gen     *email.ExpiryGenerator
	dashURL string
	logger  *slog.Logger
}

func NewSubscriptionExpiryJob(
	subs *repository.SubscriptionRepo,
	reports *repository.ReportsRepo,
	mailer *email.Mailer,
	gen *email.ExpiryGenerator,
	dashURL string,
	logger *slog.Logger,
) *SubscriptionExpiryJob {
	return &SubscriptionExpiryJob{
		subs:    subs,
		reports: reports,
		mailer:  mailer,
		gen:     gen,
		dashURL: dashURL,
		logger:  logger,
	}
}

// Start runs the job in the background. Cancel ctx to stop cleanly.
func (j *SubscriptionExpiryJob) Start(ctx context.Context) {
	go j.loop(ctx)
}

func (j *SubscriptionExpiryJob) loop(ctx context.Context) {
	j.logger.Info("scheduler: subscription expiry job started")

	// Run immediately on start so a fresh deploy doesn't wait up to 1 hour
	// before processing any due notifications.
	runCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	j.run(runCtx)
	cancel()

	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			j.logger.Info("scheduler: subscription expiry job stopped")
			return
		case <-ticker.C:
			runCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
			j.run(runCtx)
			cancel()
		}
	}
}

func (j *SubscriptionExpiryJob) run(ctx context.Context) {
	now := time.Now().In(wib) // wib defined in weekly_tips.go

	// H-3: subscriptions expiring 3 calendar days from now (WIB).
	j.processExpiring(ctx, "h3", now.Add(3*24*time.Hour))
	// H-0: subscriptions expiring today (WIB).
	j.processExpiring(ctx, "h0", now)
}

func (j *SubscriptionExpiryJob) processExpiring(ctx context.Context, notifType string, date time.Time) {
	subs, err := j.subs.FindExpiringOn(ctx, date)
	if err != nil {
		j.logger.Error("scheduler: expiry query failed",
			"type", notifType, "date", date.Format("2006-01-02"), "err", err)
		return
	}
	if len(subs) == 0 {
		return
	}

	j.logger.Info("scheduler: subscription expiry check",
		"type", notifType, "date", date.Format("2006-01-02"), "count", len(subs))

	now := time.Now()
	since := now.Add(-30 * 24 * time.Hour)

	for _, sub := range subs {
		if err := j.sendOne(ctx, sub, notifType, since, now); err != nil {
			j.logger.Error("scheduler: expiry notification failed — skipping store",
				"store_id", sub.StoreID,
				"store", sub.StoreName,
				"type", notifType,
				"err", err,
			)
		}
	}
}

func (j *SubscriptionExpiryJob) sendOne(
	ctx context.Context,
	sub *repository.ExpiringSubscription,
	notifType string,
	since, until time.Time,
) error {
	// Atomically claim the send slot. Under multiple pods this INSERT races;
	// the DB primary key guarantees only one INSERT wins. The pod that gets
	// RowsAffected == 0 skips — no TOCTOU window, no duplicate emails.
	claimed, err := j.subs.ClaimNotification(ctx, sub.StoreID, notifType, sub.ExpiresAt)
	if err != nil {
		return err
	}
	if !claimed {
		return nil
	}

	// The claim is taken BEFORE the send (that's what makes it race-free
	// across pods), so any failure after this point must give it back —
	// otherwise a transient reports/mailer hiccup permanently suppresses
	// this store's H-3/H-0 email with nothing but a log line. release()
	// uses a detached context so it still runs if ctx is already dead.
	release := func() {
		rctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer cancel()
		if rerr := j.subs.ReleaseNotification(rctx, sub.StoreID, notifType, sub.ExpiresAt); rerr != nil {
			j.logger.Error("scheduler: release expiry claim failed — email will stay suppressed",
				"store_id", sub.StoreID, "type", notifType, "err", rerr)
		}
	}

	// Pull 30-day stats.
	headline, err := j.reports.Headline(ctx, sub.StoreID, since, until)
	if err != nil {
		release()
		return err
	}
	topProds, err := j.reports.TopProducts(ctx, sub.StoreID, since, until, 1)
	if err != nil {
		release()
		return err
	}

	topProduct := ""
	topQty := 0
	if len(topProds) > 0 {
		topProduct = topProds[0].ProductName
		topQty = topProds[0].QtySold
	}

	daysLeft := 3
	if notifType == "h0" {
		daysLeft = 0
	}

	data := email.ExpiryEmailData{
		StoreName:     sub.StoreName,
		OwnerName:     sub.OwnerName,
		Plan:          sub.Plan,
		ExpiresAt:     sub.ExpiresAt,
		NotifType:     notifType,
		DaysLeft:      daysLeft,
		TotalOrders:   headline.OrdersTotal,
		RevenueCents:  headline.RevenueCents,
		TopProduct:    topProduct,
		TopProductQty: topQty,
		RenewURL:      j.dashURL,
	}

	content := j.gen.Generate(ctx, data)
	subject, text, htmlBody := email.RenderSubscriptionExpiry(content, data)

	msg := email.Message{
		To:       sub.OwnerEmail,
		ToName:   sub.OwnerName,
		Subject:  subject,
		Text:     text,
		HTML:     htmlBody,
		Category: "subscription_expiry",
	}
	// Send synchronously here (unlike the request-path fire-and-forget)
	// so a delivery failure can hand the dedup claim back and let the
	// next tick retry. When the mailer isn't configured at all, retrying
	// is pointless — keep the claim and stay quiet.
	if j.mailer.Configured() {
		if err := j.mailer.SendSync(msg); err != nil {
			release()
			return err
		}
	}

	j.logger.Info("scheduler: subscription expiry email sent",
		"store", sub.StoreName, "type", notifType,
		"expires_at", sub.ExpiresAt.Format("2006-01-02"),
	)
	return nil
}
