/// Every duration the booth runs on, in one file so the pacing can be read
/// and tuned without hunting through screens.
///
/// The payment numbers are ported from the web kiosk
/// (web/src/components/storefront/kiosk/kiosk-payment-screen.tsx), which has
/// already run these in front of real customers.
class Timeouts {
  /// Status poll while a QR is on screen.
  static const paymentPoll = Duration(seconds: 3);

  /// Back off once a payment is clearly not coming soon, so a forgotten
  /// screen does not poll every 3s for two minutes.
  static const paymentPollSlow = Duration(seconds: 5);
  static const paymentPollSlowAfter = Duration(seconds: 60);

  /// Give up on an unpaid session. Matches the web kiosk's PAY_ABANDON_MS.
  static const paymentAbandon = Duration(seconds: 120);

  /// Thank-you screen auto-reset. Matches CONFIRM_RESET_MS.
  static const thankYouReset = Duration(seconds: 25);

  /// Per-shot countdown and the pause between shots.
  static const shotCountdown = Duration(seconds: 3);
  static const betweenShots = Duration(milliseconds: 1500);

  /// After payment these advance the flow rather than cancelling it. The
  /// customer has already paid; stranding them on a decoration screen because
  /// they walked off for a moment would be taking their money for nothing.
  static const decorateIdle = Duration(seconds: 90);
  static const previewIdle = Duration(seconds: 60);

  /// A paid session found on disk at cold start is resumable for this long.
  /// Past it, the customer has certainly gone.
  static const resumeWindow = Duration(minutes: 30);

  /// Print retries.
  static const printAttempts = 3;
  static const printBackoff = [Duration(seconds: 2), Duration(seconds: 5)];

  /// Idle heartbeat to the server.
  static const heartbeat = Duration(minutes: 2);
}
