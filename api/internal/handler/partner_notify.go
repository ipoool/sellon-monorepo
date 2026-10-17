package handler

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/email"
	"github.com/sellon/sellon/api/internal/repository"
)

// PartnerNotifier tells a partner when someone they referred starts paying.
//
// One type shared by both settle paths — the Midtrans webhook and the admin's
// manual activation — so a commission earned through a bank transfer is
// announced exactly the way one earned through QRIS is.
type PartnerNotifier struct {
	partners *repository.PartnerRepo
	mailer   *email.Mailer
	logger   *slog.Logger
}

func NewPartnerNotifier(partners *repository.PartnerRepo, mailer *email.Mailer, logger *slog.Logger) *PartnerNotifier {
	return &PartnerNotifier{partners: partners, mailer: mailer, logger: logger}
}

// NotifySettled claims and sends the notification for a settled invoice.
//
// Call it AFTER the settle has committed. An email cannot be recalled: sending
// one from inside a transaction that then rolls back tells a partner they
// earned money they did not.
//
// Detached context and its own goroutine, like the repo's other post-commit
// side effects — the seller's upgrade response must not wait on Mailtrap, and
// a cancelled request must not skip the notification.
func (n *PartnerNotifier) NotifySettled(invoiceID uuid.UUID) {
	if n == nil || n.partners == nil {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		// The claim is the dedup: a redelivered webhook finds notified_at
		// already set and gets nothing back, so one sale is announced once.
		notice, err := n.partners.ClaimCommissionNotice(ctx, invoiceID)
		if err != nil {
			n.logger.Error("partner notice claim", "err", err, "invoice_id", invoiceID.String())
			return
		}
		if notice == nil {
			// No commission, already announced, or the partner has no
			// contact address on file. All unremarkable.
			return
		}

		subject, text, htmlBody := email.RenderPartnerCommission(email.PartnerCommissionData{
			PartnerName:     notice.PartnerName,
			ContactName:     notice.ContactName,
			StoreName:       notice.StoreName,
			Plan:            notice.Plan,
			Months:          notice.Months,
			BaseAmountCents: notice.BaseAmountCents,
			CommissionBps:   notice.CommissionBps,
			CommissionCents: notice.CommissionCents,
			TotalOwedCents:  notice.TotalOwedCents,
		})

		if n.mailer == nil || !n.mailer.Configured() {
			// Worth a log line rather than silence: the commission is
			// recorded and visible in the console, but the partner has not
			// actually been told, and someone should know that.
			n.logger.Warn("partner commission email skipped: mailer not configured",
				"partner", notice.PartnerName, "amount_cents", notice.CommissionCents)
			return
		}

		n.mailer.Send(email.Message{
			To:       notice.ContactEmail,
			ToName:   notice.ContactName,
			Subject:  subject,
			Text:     text,
			HTML:     htmlBody,
			Category: "partner-commission",
			// No UnsubscribeURL on purpose: this is a payment notification
			// under a commercial agreement, not marketing. See the
			// transactional-vs-marketing rule in CLAUDE.md.
		})
		n.logger.Info("partner commission notified",
			"partner", notice.PartnerName,
			"commission_cents", notice.CommissionCents,
			"owed_cents", notice.TotalOwedCents)
	}()
}
