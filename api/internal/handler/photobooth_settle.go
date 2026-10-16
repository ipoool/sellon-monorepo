package handler

import (
	"context"
	"errors"
	"log/slog"

	"github.com/sellon/sellon/api/internal/repository"
)

// SettlePhotoBoothSession is the ONE place a PhotoBoost session becomes paid.
//
// Both settlement routes call it — the platform webhook and the poll-time
// reconcile — so the amount check, the guard and the replay handling cannot
// drift apart between them. That mattered enough on the order path to be
// written down in CLAUDE.md; it matters more here, because an unattended booth
// has nobody standing beside it to notice a double settle.
//
// Returns (nil, nil) for a replay: the caller should acknowledge and fire no
// side effects. A non-nil change means this call is the one that settled it.
func SettlePhotoBoothSession(
	ctx context.Context,
	sessions *repository.PhotoBoothSessionRepo,
	logger *slog.Logger,
	s *repository.PhotoBoothSession,
	grossAmount string,
	transactionID string,
) (*repository.SessionPaymentChange, error) {
	// Amount integrity, the same rule and the same tolerance the subscription
	// and order webhooks apply. The signature already covers gross_amount, so
	// this is not about forgery: it catches a transaction whose amount drifted
	// from the session (a price edited mid-flight, a transaction recreated by
	// hand in the Midtrans dashboard under the same order id).
	const grossToleranceCents = 100
	if cents, ok := rupiahToCents(grossAmount); ok {
		if absInt64(cents-s.AmountCents) >= grossToleranceCents {
			logger.Error("photobooth: gross_amount mismatch — not settling",
				"session", s.SessionNumber,
				"midtrans_cents", cents, "session_cents", s.AmountCents)
			// Flag and refuse. Settling would hand out photos for the wrong
			// money; silently ignoring would hide it from ops.
			_ = sessions.FlagNeedsReview(ctx, s.ID, "Nominal pembayaran tidak cocok")
			return nil, nil
		}
	}

	change, err := sessions.SetSessionPaidGuarded(ctx, s.ID, transactionID)
	if errors.Is(err, repository.ErrSessionPaymentUnchanged) {
		// Replay, or a concurrent caller won. Either way the money is already
		// recorded exactly once.
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if change.WasExpired {
		logger.Warn("photobooth: payment arrived after the session ended",
			"session", change.SessionNumber)
	}
	return change, nil
}
