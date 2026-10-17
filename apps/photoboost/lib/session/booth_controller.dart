// ignore_for_file: prefer_initializing_formals
// The dependencies are private fields with public parameter names. Dart does
// not allow `this._api` as a NAMED parameter (the name would be private), so
// the initializer list is the only way to express this.

import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:flutter/foundation.dart';

import 'dart:ui' as ui;

import '../camera/camera_source.dart';
import '../compose/composite_renderer.dart';
import '../compose/photo_filter.dart';
import '../data/api/booth_api.dart';
import '../data/api/session_dto.dart';
import '../printing/printer.dart';
import 'booth_state.dart';
import 'timeouts.dart';

/// The booth's one state machine. Every transition happens here; screens read
/// [state] and call the handful of intents below.
///
/// The rule that shapes all of it: **before Paid, any timeout may return to
/// idle. After Paid, no path returns to idle without either a successful
/// print or a recorded failure plus a code the customer can take to an
/// operator.** Timeouts after payment therefore advance the flow rather than
/// cancelling it — the customer has already paid, and stranding them because
/// they looked away is taking their money for nothing.
class BoothController extends ChangeNotifier {
  BoothController({
    required BoothApi api,
    required CameraSource camera,
    required BoothPrinter printer,
    required Directory mediaDir,
    CompositeRenderer renderer = const CompositeRenderer(),
  }) : _api = api,
       _camera = camera,
       _printer = printer,
       _mediaDir = mediaDir,
       _renderer = renderer;

  final BoothApi _api;
  final CameraSource _camera;
  final BoothPrinter _printer;
  final Directory _mediaDir;
  final CompositeRenderer _renderer;

  BoothState _state = const Idle();
  BoothState get state => _state;

  BoothConfig? _config;
  BoothConfig? get config => _config;

  /// Exposed so the capture screens can render the live preview behind
  /// their overlays.
  CameraSource get camera => _camera;

  final _shots = <File>[];
  PhotoFilter _filter = PhotoFilter.normal;
  Timer? _ticker;
  Timer? _pollTimer;
  bool _busy = false;

  Future<void> start() async {
    try {
      _config = await _api.fetchConfig();
      await _camera.open();
      _set(const Idle());
    } catch (e) {
      _set(Fatal('Gagal memuat konfigurasi: $e'));
    }
  }

  /// Customer pressed Mulai.
  Future<void> beginSession() async {
    if (_busy || _state is! Idle) return;
    _busy = true;
    _set(const CreatingSession());
    try {
      // One key per press, reused for every retry of THIS press. Two presses
      // are two customers; two retries are one.
      final key = _newKey();
      var session = await _api.createSession(idempotencyKey: key);
      session = await _api.charge(session.sessionNumber);
      _shots.clear();
      _filter = PhotoFilter.normal;
      _startPaymentWatch(session);
    } catch (e) {
      _set(Fatal('Gagal memulai sesi: $e'));
    } finally {
      _busy = false;
    }
  }

  void _startPaymentWatch(BoothSession session) {
    final deadline = DateTime.now().add(Timeouts.paymentAbandon);
    _set(
      AwaitingPayment(session, secondsLeft: Timeouts.paymentAbandon.inSeconds),
    );

    _pollTimer?.cancel();
    void schedule() {
      final elapsed =
          Timeouts.paymentAbandon - deadline.difference(DateTime.now());
      final interval = elapsed > Timeouts.paymentPollSlowAfter
          ? Timeouts.paymentPollSlow
          : Timeouts.paymentPoll;
      _pollTimer = Timer(interval, () async {
        if (_state is! AwaitingPayment) return;
        try {
          final fresh = await _api.getSession(session.sessionNumber);
          if (fresh.isPaid) {
            _pollTimer?.cancel();
            _ticker?.cancel();
            await _onPaid(fresh);
            return;
          }
          if (fresh.isExpired) {
            _pollTimer?.cancel();
            _ticker?.cancel();
            _set(PaymentExpired(fresh));
            return;
          }
        } catch (_) {
          // A failed poll is not a failed payment. Keep waiting; the money
          // may already be in and the next poll will see it.
        }
        schedule();
      });
    }

    schedule();
    _countdown(
      seconds: Timeouts.paymentAbandon.inSeconds,
      onTick: (left) {
        if (_state case AwaitingPayment(session: final s)) {
          _set(AwaitingPayment(s, secondsLeft: left));
        }
      },
      onDone: () {
        if (_state is AwaitingPayment) {
          _pollTimer?.cancel();
          _set(PaymentExpired(session));
        }
      },
    );
  }

  Future<void> _onPaid(BoothSession session) async {
    _set(Paid(session));
    await Future<void>.delayed(const Duration(milliseconds: 900));
    await _runCapture(session);
  }

  Future<void> _runCapture(BoothSession session) async {
    await _captureShot(session, _shots.length);
  }

  /// Takes one shot, then stops and waits for the customer.
  ///
  /// Shooting all four back to back meant a customer who blinked, or who was
  /// still arranging themselves, had no way to see what they got until the
  /// end. Now each shot lands on screen and they press Lanjut when ready.
  Future<void> _captureShot(BoothSession session, int index) async {
    for (var c = Timeouts.shotCountdown.inSeconds; c > 0; c--) {
      _set(GetReady(session, shotIndex: index, count: c));
      await Future<void>.delayed(const Duration(seconds: 1));
    }
    _set(Capturing(session, shotIndex: index));

    try {
      final path = '${_mediaDir.path}/${session.sessionNumber}/shot-$index.png';
      final file = await _camera.capture(path);
      // Flushed to disk before the UI moves on: a shot held only in memory
      // dies with the process, and the customer has already paid for it.
      _shots.add(file);
    } catch (e) {
      debugPrint('capture failed: $e');
    }

    unawaited(
      _api
          .reportShots(session.sessionNumber, _shots.length)
          .catchError((_) => session),
    );

    _awaitContinue(session);
  }

  /// Parks on the review screen until the customer presses Lanjut, or the
  /// safety timeout advances for them.
  void _awaitContinue(BoothSession session) {
    _set(
      ShotTaken(
        session,
        shots: List.of(_shots),
        secondsLeft: Timeouts.shotReviewIdle.inSeconds,
      ),
    );

    _countdown(
      seconds: Timeouts.shotReviewIdle.inSeconds,
      onTick: (left) {
        if (_state case ShotTaken(session: final s, shots: final sh)) {
          _set(ShotTaken(s, shots: sh, secondsLeft: left));
        }
      },
      onDone: continueCapture,
    );
  }

  /// "Lanjut foto" — the next shot, or on to choosing a frame.
  void continueCapture() {
    if (_state case ShotTaken(session: final session)) {
      _ticker?.cancel();
      if (_shots.length >= session.shotsPlanned) {
        _startDecorating(session);
      } else {
        unawaited(_captureShot(session, _shots.length));
      }
    }
  }

  /// Retakes the shot just taken. The file is dropped and the counter walks
  /// back; the server's count is monotonic, so it simply stays where it is
  /// until the replacement is reported.
  Future<void> retakeShot() async {
    if (_state case ShotTaken(session: final session)) {
      _ticker?.cancel();
      if (_shots.isNotEmpty) {
        final f = _shots.removeLast();
        try {
          await f.delete();
        } catch (_) {
          // A stale file on disk is harmless; the strip reads from _shots.
        }
      }
      unawaited(_captureShot(session, _shots.length));
    }
  }

  void _startDecorating(BoothSession session) {
    final first = _config?.frames.firstOrNull?.id;
    _set(
      Decorating(
        session,
        shots: List.of(_shots),
        frameId: first,
        filter: _filter,
      ),
    );
    // Advance, never cancel: picking nothing means picking the default.
    _timeout(Timeouts.decorateIdle, () {
      if (_state case Decorating(frameId: final f)) {
        _set(
          Previewing(
            session,
            shots: List.of(_shots),
            frameId: f,
            filter: _filter,
          ),
        );
        _armPreviewTimeout(session, f);
      }
    });
  }

  void chooseFrame(String frameId) {
    if (_state case Decorating(session: final s, shots: final sh)) {
      _set(Decorating(s, shots: sh, frameId: frameId, filter: _filter));
    }
  }

  /// Picks a colour treatment. Applied to the preview, the print and the
  /// soft copy from one definition, so they cannot disagree.
  void chooseFilter(PhotoFilter f) {
    _filter = f;
    if (_state case Decorating(
      session: final s,
      shots: final sh,
      frameId: final fr,
    )) {
      _set(Decorating(s, shots: sh, frameId: fr, filter: f));
    }
  }

  void confirmFrame() {
    if (_state case Decorating(
      session: final s,
      shots: final sh,
      frameId: final f,
    )) {
      _ticker?.cancel();
      _set(Previewing(s, shots: sh, frameId: f, filter: _filter));
      _armPreviewTimeout(s, f);
    }
  }

  void _armPreviewTimeout(BoothSession session, String? frameId) {
    // Auto-print rather than auto-cancel. They paid.
    _timeout(Timeouts.previewIdle, () {
      if (_state is Previewing) printNow();
    });
  }

  Future<void> printNow() async {
    if (_state case Previewing(
      session: final session,
      frameId: final frameId,
    )) {
      _ticker?.cancel();
      _set(Printing(session, progress: 0));
      try {
        final status = await _printer.probe();
        if (!status.canPrint) {
          await _failPrint(
            session,
            status.detail.isEmpty ? 'Printer tidak siap' : status.detail,
          );
          return;
        }
        // The composite is rendered by the print layer; progress is streamed
        // so a 20-second thermal print does not look like a frozen screen.
        await for (final p in _printer.print(
          PrintJob(
            image: await _renderForPrint(),
            copies: session.printCopies,
            sessionNumber: session.sessionNumber,
            boothName: _config?.boothName ?? 'PhotoBoost',
            takenAt: DateTime.now(),
          ),
        )) {
          _set(Printing(session, progress: p.fraction));
        }
        await _api
            .complete(
              session.sessionNumber,
              succeeded: true,
              frameId: frameId ?? '',
            )
            .catchError((_) => session);

        // Thank-you screen first, QR when the upload lands. Uploading before
        // showing anything would leave the customer watching a progress bar
        // after their photo has already come out of the printer.
        _startThankYou(session);
        unawaited(_shareSoftCopy(session));
      } catch (e) {
        await _failPrint(session, '$e');
      }
    }
  }

  Future<void> _failPrint(BoothSession session, String reason) async {
    await _api
        .complete(
          session.sessionNumber,
          succeeded: false,
          failureReason: reason,
        )
        .catchError((_) => session);
    // Show the code, not an apology screen with no way forward.
    _set(PrintFailed(session, reason: reason));
  }

  void _startThankYou(BoothSession session) {
    _set(ThankYou(session, secondsLeft: Timeouts.thankYouReset.inSeconds));
    _countdown(
      seconds: Timeouts.thankYouReset.inSeconds,
      onTick: (left) {
        // Preserve the share link across ticks: it arrives mid-countdown.
        if (_state case ThankYou(shareUrl: final url)) {
          _set(ThankYou(session, secondsLeft: left, shareUrl: url));
        }
      },
      onDone: reset,
    );
  }

  /// Uploads the strip so the customer can scan the QR and keep a copy.
  ///
  /// Rendered fresh at 1080px in colour rather than reusing the print
  /// composite: that one is sized to the printer's 576 dots and drops the
  /// caption for the thermal driver. A keepsake on a phone deserves better
  /// than a receipt-width image.
  ///
  /// Best-effort by design: a storage outage must not cost anyone their
  /// print, which already happened by the time this runs.
  Future<void> _shareSoftCopy(BoothSession session) async {
    try {
      final composite = await renderPreview(1080);
      final data = await composite.toByteData(format: ui.ImageByteFormat.png);
      if (data == null) return;
      final share = await _api.uploadPhoto(
        session.sessionNumber,
        data.buffer.asUint8List(),
      );
      if (share == null || share.shareUrl.isEmpty) return;
      if (_state case ThankYou(secondsLeft: final left)) {
        _set(ThankYou(session, secondsLeft: left, shareUrl: share.shareUrl));
      }
    } catch (e) {
      debugPrint('soft copy upload failed: $e');
    }
  }

  /// Back to idle. Only legal once the session is finished one way or the
  /// other — the screens never offer it mid-flow after payment.
  void reset() {
    _ticker?.cancel();
    _pollTimer?.cancel();
    _shots.clear();
    _set(const Idle());
  }

  /// Cancel is free only before the money lands.
  void cancelBeforePayment() {
    if (_state.isPaid) return;
    reset();
  }

  /// Renders the strip at the printer's own width.
  ///
  /// The caption is left out for a monochrome printer: rasterised type at
  /// 203 dpi dithers into a solid black bar, so the thermal driver prints
  /// those lines as text instead.
  Future<ui.Image> _renderForPrint() async {
    final images = <ui.Image>[];
    for (final f in _shots) {
      images.add(await decodeImageFile(f));
    }
    return _renderer.render(
      shots: images,
      width: _printer.capabilities.dotsPerLine.toDouble(),
      boothName: _config?.boothName ?? 'PhotoBoost',
      sessionNumber: switch (_state) {
        Previewing(session: final s) => s.sessionNumber,
        Printing(session: final s) => s.sessionNumber,
        _ => '',
      },
      filter: _filter,
      monochrome: !_printer.capabilities.isColor,
    );
  }

  /// Exposed so the preview screen renders the SAME layout the printer will,
  /// just at screen width — the whole point of having one renderer.
  Future<ui.Image> renderPreview(double width) async {
    final images = <ui.Image>[];
    for (final f in _shots) {
      images.add(await decodeImageFile(f));
    }
    return _renderer.render(
      shots: images,
      width: width,
      boothName: _config?.boothName ?? 'PhotoBoost',
      sessionNumber: switch (_state) {
        Decorating(session: final s) => s.sessionNumber,
        Previewing(session: final s) => s.sessionNumber,
        _ => '',
      },
      filter: _filter,
    );
  }

  void _countdown({
    required int seconds,
    required void Function(int) onTick,
    required VoidCallback onDone,
  }) {
    _ticker?.cancel();
    var left = seconds;
    _ticker = Timer.periodic(const Duration(seconds: 1), (t) {
      left--;
      if (left <= 0) {
        t.cancel();
        onDone();
      } else {
        onTick(left);
      }
    });
  }

  void _timeout(Duration d, VoidCallback fn) {
    _ticker?.cancel();
    _ticker = Timer(d, fn);
  }

  String _newKey() {
    final r = Random.secure();
    return List.generate(
      16,
      (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
  }

  /// Pins the machine to a state. Test-only: it bypasses every transition
  /// rule, which is exactly what makes it useful for rendering screens and
  /// exactly why nothing in the app may call it.
  @visibleForTesting
  void debugSet(BoothState s) => _set(s);

  void _set(BoothState s) {
    _state = s;
    notifyListeners();
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _pollTimer?.cancel();
    super.dispose();
  }
}

extension<T> on List<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
