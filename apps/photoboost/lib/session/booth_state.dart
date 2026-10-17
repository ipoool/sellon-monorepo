import 'dart:io';

import '../data/api/session_dto.dart';

/// The booth is one long-lived machine, so its state is one sealed type
/// rather than a pile of booleans. Every screen is a function of this value.
sealed class BoothState {
  const BoothState();

  /// True once the customer's money is in. Past this point the machine may
  /// never return to idle without either printing or recording a failure the
  /// customer can take to an operator.
  bool get isPaid => switch (this) {
    Paid() ||
    GetReady() ||
    Capturing() ||
    ShotTaken() ||
    Decorating() ||
    Previewing() ||
    Printing() ||
    PrintFailed() ||
    ThankYou() => true,
    _ => false,
  };
}

/// No device token yet, or it was revoked. Only the admin screen can help.
class Unregistered extends BoothState {
  const Unregistered(this.reason);
  final String reason;
}

class Idle extends BoothState {
  const Idle();
}

class CreatingSession extends BoothState {
  const CreatingSession();
}

class AwaitingPayment extends BoothState {
  const AwaitingPayment(this.session, {required this.secondsLeft});
  final BoothSession session;
  final int secondsLeft;
}

class PaymentExpired extends BoothState {
  const PaymentExpired(this.session);
  final BoothSession session;
}

class Paid extends BoothState {
  const Paid(this.session);
  final BoothSession session;
}

class GetReady extends BoothState {
  const GetReady(this.session, {required this.shotIndex, required this.count});
  final BoothSession session;
  final int shotIndex;
  final int count;
}

class Capturing extends BoothState {
  const Capturing(this.session, {required this.shotIndex});
  final BoothSession session;
  final int shotIndex;
}

/// A shot is on screen and the customer decides when to continue.
///
/// [secondsLeft] counts down a safety net, not a deadline: when it reaches
/// zero the flow ADVANCES on its own, because a paid session must never be
/// left parked on a review screen.
class ShotTaken extends BoothState {
  const ShotTaken(
    this.session, {
    required this.shots,
    required this.secondsLeft,
  });

  final BoothSession session;
  final List<File> shots;
  final int secondsLeft;

  /// True when this was the last shot the customer paid for.
  bool get isLast => shots.length >= session.shotsPlanned;
}

class Decorating extends BoothState {
  const Decorating(this.session, {required this.shots, this.frameId});
  final BoothSession session;
  final List<File> shots;
  final String? frameId;
}

class Previewing extends BoothState {
  const Previewing(this.session, {required this.shots, this.frameId});
  final BoothSession session;
  final List<File> shots;
  final String? frameId;
}

class Printing extends BoothState {
  const Printing(this.session, {required this.progress});
  final BoothSession session;
  final double progress; // 0..1
}

/// Printing is impossible (no paper, printer offline). The customer paid, so
/// the session code goes on screen for an operator to reprint from.
class PrintFailed extends BoothState {
  const PrintFailed(this.session, {required this.reason});
  final BoothSession session;
  final String reason;
}

class ThankYou extends BoothState {
  const ThankYou(this.session, {required this.secondsLeft, this.shareUrl});

  final BoothSession session;
  final int secondsLeft;

  /// Where the QR points, so the customer can take the soft copy home.
  /// Null when the upload failed — they still have the print, so the screen
  /// simply omits the QR rather than apologising for something they may not
  /// have wanted anyway.
  final String? shareUrl;
}

/// Something unrecoverable, before any money was taken.
class Fatal extends BoothState {
  const Fatal(this.message);
  final String message;
}
