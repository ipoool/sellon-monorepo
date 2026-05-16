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

const jobName = "weekly_tips"

// wib is UTC+7 (Waktu Indonesia Barat). Fixed offset so the binary works on
// container images without a tz database.
var wib = time.FixedZone("WIB", 7*60*60)

// WeeklyTipsJob sends a rotating tips email every Monday at 07:00 WIB.
// State is persisted in the scheduler_state table so restarts never
// re-send an email that was already delivered this week.
type WeeklyTipsJob struct {
	users   *repository.UserRepo
	state   *repository.SchedulerStateRepo
	mailer  *email.Mailer
	gen     *email.TipGenerator
	dashURL string
	logger  *slog.Logger
}

func NewWeeklyTipsJob(
	users *repository.UserRepo,
	state *repository.SchedulerStateRepo,
	mailer *email.Mailer,
	gen *email.TipGenerator,
	dashURL string,
	logger *slog.Logger,
) *WeeklyTipsJob {
	return &WeeklyTipsJob{
		users:   users,
		state:   state,
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
		until := j.untilNextRun(ctx)

		j.logger.Info("scheduler: weekly tips sleeping",
			"next_run_in", until.Round(time.Minute).String())

		select {
		case <-ctx.Done():
			j.logger.Info("scheduler: weekly tips stopped")
			return
		case <-time.After(until):
		}

		runCtx, cancel := context.WithTimeout(ctx, 15*time.Minute)
		j.run(runCtx)
		cancel()
	}
}

// untilNextRun checks whether this week's email was already sent.
// If yes → return time until NEXT Monday 07:00 WIB.
// If no  → return time until the coming Monday 07:00 WIB (could be very soon
//
//	if we just restarted after a crash on Monday before 07:00).
func (j *WeeklyTipsJob) untilNextRun(ctx context.Context) time.Duration {
	now := time.Now().In(wib)
	_, week := now.ISOWeek()
	year := now.Year()

	already, err := j.state.AlreadyRanThisWeek(ctx, jobName, week, year)
	if err != nil {
		j.logger.Warn("scheduler: state check failed, assuming not sent", "err", err)
		already = false
	}

	if already {
		// This week's email was already delivered — skip to next Monday.
		j.logger.Info("scheduler: weekly tips already sent this week, skipping to next Monday",
			"week", week, "year", year)
		return j.durationToMonday(now.Add(7 * 24 * time.Hour)) // force advance past this week
	}

	return j.durationToMonday(now)
}

// durationToMonday returns how long until the next Monday 07:00 WIB that is
// strictly after `from`. Passing a time already past Monday 07:00 skips to
// the following Monday.
func (j *WeeklyTipsJob) durationToMonday(from time.Time) time.Duration {
	from = from.In(wib)
	candidate := time.Date(from.Year(), from.Month(), from.Day(), 7, 0, 0, 0, wib)
	for candidate.Weekday() != time.Monday || !candidate.After(from) {
		candidate = candidate.Add(24 * time.Hour)
		candidate = time.Date(candidate.Year(), candidate.Month(), candidate.Day(), 7, 0, 0, 0, wib)
	}
	return candidate.Sub(time.Now().In(wib))
}

func (j *WeeklyTipsJob) run(ctx context.Context) {
	now := time.Now().In(wib)
	_, weekNum := now.ISOWeek()
	year := now.Year()

	// Double-check inside run in case two instances race (container restart overlap).
	already, err := j.state.AlreadyRanThisWeek(ctx, jobName, weekNum, year)
	if err != nil {
		j.logger.Error("scheduler: state check failed", "err", err)
		return
	}
	if already {
		j.logger.Info("scheduler: weekly tips already sent this week (race guard), skipping",
			"week", weekNum, "year", year)
		return
	}

	// Generate content — prefer Claude API, fall back to static pool.
	var tip email.WeeklyTip
	if j.gen.Configured() {
		generated, err := j.gen.Generate(ctx, weekNum, year)
		if err != nil {
			j.logger.Warn("scheduler: AI generation failed, using static pool",
				"week", weekNum, "err", err)
			tip = email.StaticTipForWeek(weekNum)
		} else {
			tip = generated
		}
	} else {
		j.logger.Info("scheduler: Anthropic not configured, using static pool")
		tip = email.StaticTipForWeek(weekNum)
	}

	users, err := j.users.ListForMarketing(ctx)
	if err != nil {
		j.logger.Error("scheduler: db query failed", "err", err)
		return
	}
	if len(users) == 0 {
		j.logger.Info("scheduler: no eligible users, skipping")
		// Still mark ran so we don't retry endlessly this week.
		_ = j.state.MarkRan(ctx, jobName, weekNum, year)
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
			j.logger.Warn("scheduler: context cancelled mid-send, will retry next week",
				"sent_so_far", sent)
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

	// Persist only after the full batch completes successfully.
	if err := j.state.MarkRan(ctx, jobName, weekNum, year); err != nil {
		j.logger.Error("scheduler: failed to persist state", "err", err)
	} else {
		j.logger.Info("scheduler: weekly tips done", "week", weekNum, "sent", sent)
	}
}

func firstWord(s string) string {
	for i, r := range s {
		if r == ' ' {
			return s[:i]
		}
	}
	return s
}
