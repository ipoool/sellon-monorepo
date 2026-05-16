// send-test-expiry-email is a one-shot command that sends H-3 and H-0
// test subscription-expiry emails to the address given as the first argument.
//
// Usage (inside api container):
//
//	go run ./cmd/send-test-expiry-email asepulloh0109@gmail.com
//
// It uses the same config (.env) and email/AI packages as the real server, so
// the rendered output is bit-for-bit identical to what subscribers will receive.
package main

import (
	"context"
	"log/slog"
	"os"
	"time"

	"github.com/sellon/sellon/api/internal/config"
	"github.com/sellon/sellon/api/internal/email"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))

	to := "asepulloh0109@gmail.com"
	if len(os.Args) > 1 {
		to = os.Args[1]
	}

	cfg, err := config.Load()
	if err != nil {
		logger.Error("config load failed", "err", err)
		os.Exit(1)
	}

	mailer := email.NewMailer(cfg.MailtrapAPIKey, cfg.FromEmail, cfg.FromName, logger)
	if !mailer.Configured() {
		logger.Error("Mailtrap not configured — set MAILTRAP_API_KEY + FROM_EMAIL in .env")
		os.Exit(1)
	}

	gen := email.NewExpiryGenerator(cfg.AnthropicAPIKey, logger)
	renewURL := cfg.PrimaryWebOrigin() + "/settings/subscription"

	wib, _ := time.LoadLocation("Asia/Jakarta")
	now := time.Now().In(wib)

	// Realistic test data — mirrors a seller who has been active for a while.
	base := email.ExpiryEmailData{
		StoreName:     "Dapur Ibu Sari",
		OwnerName:     "Asep Ullah",
		Plan:          "pro",
		TotalOrders:   47,
		RevenueCents:  12_350_000 * 100, // Rp 12.350.000
		TopProduct:    "Rendang Sapi Padang 500g",
		TopProductQty: 23,
		RenewURL:      renewURL,
	}

	ctx := context.Background()

	variants := []struct {
		notifType string
		label     string
		expiresAt time.Time
	}{
		{"h3", "H-3", now.Add(3 * 24 * time.Hour)},
		{"h0", "Hari H (H-0)", now},
	}

	for _, v := range variants {
		data := base
		data.NotifType = v.notifType
		data.ExpiresAt = v.expiresAt
		if v.notifType == "h0" {
			data.DaysLeft = 0
		} else {
			data.DaysLeft = 3
		}

		content := gen.Generate(ctx, data)
		subject, text, htmlBody := email.RenderSubscriptionExpiry(content, data)

		logger.Info("sending test email", "variant", v.label, "to", to, "subject", subject)

		if err := mailer.SendSync(email.Message{
			To:       to,
			ToName:   "Asep Ullah",
			Subject:  "[TEST] " + subject,
			Text:     text,
			HTML:     htmlBody,
			Category: "subscription_expiry_test",
		}); err != nil {
			logger.Error("send failed", "variant", v.label, "err", err)
			os.Exit(1)
		}
		logger.Info("sent", "variant", v.label)
	}

	logger.Info("done — check your inbox for 2 emails (H-3 and H-0)")
}
