// Package scheduler provides background jobs that fire on a calendar schedule.
// Jobs run as goroutines started at server boot and stop when ctx is cancelled.
package scheduler

import (
	"context"
	"log/slog"
	"time"

	"github.com/sellon/sellon/api/internal/email"
	"github.com/sellon/sellon/api/internal/repository"
)

// wib is UTC+7 (Waktu Indonesia Barat). Using a fixed offset instead of
// loading Asia/Jakarta from tzdata so the binary stays portable across
// container images that might not ship the tz database.
var wib = time.FixedZone("WIB", 7*60*60)

// WeeklyTipsJob sends a rotating tips email every Monday at 07:00 WIB.
// Content is generated fresh via the Claude API each week; falls back to
// the static pool if the API is unavailable or not configured.
type WeeklyTipsJob struct {
	users     *repository.UserRepo
	mailer    *email.Mailer
	gen       *email.TipGenerator
	dashURL   string // e.g. https://sellon.id/dashboard
	logger    *slog.Logger
}

// NewWeeklyTipsJob constructs the job.
// dashURL should be cfg.PrimaryWebOrigin() + "/dashboard".
func NewWeeklyTipsJob(
	users *repository.UserRepo,
	mailer *email.Mailer,
	gen *email.TipGenerator,
	dashURL string,
	logger *slog.Logger,
) *WeeklyTipsJob {
	return &WeeklyTipsJob{
		users:   users,
		mailer:  mailer,
		gen:     gen,
		dashURL: dashURL,
		logger:  logger,
	}
}

// Start runs the scheduler in the background. Cancel ctx to stop cleanly.
func (j *WeeklyTipsJob) Start(ctx context.Context) {
	go j.loop(ctx)
}

func (j *WeeklyTipsJob) loop(ctx context.Context) {
	for {
		until := j.untilNextMondaySevenAM()
		j.logger.Info("scheduler: weekly tips sleeping",
			"next_run_in", until.Round(time.Minute).String())

		select {
		case <-ctx.Done():
			j.logger.Info("scheduler: weekly tips stopped")
			return
		case <-time.After(until):
		}

		j.run(ctx)
	}
}

func (j *WeeklyTipsJob) run(ctx context.Context) {
	now := time.Now().In(wib)
	_, weekNum := now.ISOWeek()
	year := now.Year()

	// Generate content — prefer Claude API, fall back to static pool.
	var tip email.WeeklyTip
	if j.gen.Configured() {
		generated, err := j.gen.Generate(ctx, weekNum, year)
		if err != nil {
			j.logger.Warn("scheduler: weekly tips — AI generation failed, using static pool",
				"week", weekNum, "year", year, "err", err)
			tip = email.StaticTipForWeek(weekNum)
		} else {
			tip = generated
		}
	} else {
		j.logger.Info("scheduler: weekly tips — Anthropic not configured, using static pool")
		tip = email.StaticTipForWeek(weekNum)
	}

	users, err := j.users.ListForMarketing(ctx)
	if err != nil {
		j.logger.Error("scheduler: weekly tips — db query failed", "err", err)
		return
	}
	if len(users) == 0 {
		j.logger.Info("scheduler: weekly tips — no eligible users, skipping")
		return
	}

	j.logger.Info("scheduler: weekly tips sending",
		"week", weekNum, "year", year,
		"subject", tip.Subject,
		"recipients", len(users),
	)

	sent := 0
	for _, u := range users {
		select {
		case <-ctx.Done():
			return
		default:
		}

		firstName := firstWord(u.Name)
		subject, text, htmlBody := email.RenderWeeklyTips(tip, firstName, j.dashURL)
		j.mailer.Send(email.Message{
			To:       u.Email,
			ToName:   u.Name,
			Subject:  subject,
			Text:     text,
			HTML:     htmlBody,
			Category: "weekly_tips",
		})
		sent++
	}
	j.logger.Info("scheduler: weekly tips queued", "week", weekNum, "queued", sent)
}

// untilNextMondaySevenAM returns the duration from now until the next
// Monday 07:00:00 WIB. If today is already Monday and the time is before
// 07:00, it fires today. Otherwise it advances to the next Monday.
func (j *WeeklyTipsJob) untilNextMondaySevenAM() time.Duration {
	now := time.Now().In(wib)
	candidate := time.Date(now.Year(), now.Month(), now.Day(), 7, 0, 0, 0, wib)
	for candidate.Weekday() != time.Monday || !candidate.After(now) {
		candidate = candidate.Add(24 * time.Hour)
		candidate = time.Date(candidate.Year(), candidate.Month(), candidate.Day(), 7, 0, 0, 0, wib)
	}
	return candidate.Sub(now)
}

func firstWord(s string) string {
	if idx := len(s); idx == 0 {
		return ""
	}
	for i, r := range s {
		if r == ' ' {
			return s[:i]
		}
	}
	return s
}
