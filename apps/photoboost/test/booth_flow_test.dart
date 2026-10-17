import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:photoboost/camera/fake_camera_source.dart';
import 'package:photoboost/data/api/fake_booth_api.dart';
import 'package:photoboost/printing/fake_printer.dart';
import 'package:photoboost/printing/printer.dart';
import 'package:photoboost/session/booth_controller.dart';
import 'package:photoboost/session/booth_state.dart';
import 'package:photoboost/session/timeouts.dart';

/// Drives the machine the way a customer does, against the fakes. This is
/// what proves the simulation actually reaches a photo rather than merely
/// looking like it does.
/// These walk the booth in real time — four 3-second countdowns, a print —
/// so they outrun the framework's 30-second default. The duration is the
/// point: a test that skipped the waits would not be testing the pacing a
/// customer actually experiences.
const _slow = Timeout(Duration(minutes: 3));

void main() {
  _noCameraNoSale();
  _shootNow();
  _priceConsistency();
  // A binding is needed for dart:ui (the composite render), but these are
  // plain `test`s rather than `testWidgets`: the controller runs on real
  // Timers, and testWidgets' fake clock would never let an `await` on one
  // of them complete.
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory media;

  setUp(() => media = Directory.systemTemp.createTempSync('pb-flow'));
  tearDown(() => media.deleteSync(recursive: true));

  BoothController build({FakeBoothApi? api, FakePrinter? printer}) =>
      BoothController(
        api: api ?? FakeBoothApi(payAfter: const Duration(milliseconds: 300)),
        camera: FakeCameraSource(),
        printer:
            printer ?? FakePrinter(duration: const Duration(milliseconds: 200)),
        mediaDir: media,
      );

  /// Polls real wall-clock time until [until] holds.
  Future<void> waitFor(
    BoothController c,
    bool Function(BoothState) until, {
    Duration limit = const Duration(seconds: 45),
  }) async {
    final deadline = DateTime.now().add(limit);
    while (!until(c.state)) {
      if (DateTime.now().isAfter(deadline)) {
        fail('timed out in ${c.state.runtimeType}');
      }
      await Future<void>.delayed(const Duration(milliseconds: 50));
    }
  }

  /// Walks the four shots by pressing Lanjut, the way a customer does.
  Future<void> pressThroughShots(BoothController c) async {
    for (var i = 0; i < 4; i++) {
      await waitFor(
        c,
        (s) => s is ShotTaken,
        limit: const Duration(seconds: 30),
      );
      c.continueCapture();
    }
  }

  test(
    'a customer gets from idle to a printed strip',
    timeout: _slow,
    () async {
      final c = build();
      addTearDown(c.dispose);
      await c.start();
      expect(c.state, isA<Idle>());

      await c.beginSession();
      await waitFor(c, (s) => s is AwaitingPayment);

      // There must be something to scan, or the customer is stuck.
      final waiting = c.state as AwaitingPayment;
      expect(waiting.session.qrString, isNotEmpty);
      // Against the config, not a literal: pinning the number here is how a
      // price change passes its own test while the booth quotes one amount
      // and charges another.
      expect(waiting.session.amountCents, c.config!.priceCents);

      await waitFor(c, (s) => s is Paid || s.isPaid);

      // Four shots. Each one stops for the customer now, so the test presses
      // Lanjut exactly as they would — nothing here advances on its own.
      for (var i = 1; i <= 4; i++) {
        await waitFor(
          c,
          (s) => s is ShotTaken,
          limit: const Duration(seconds: 30),
        );
        final taken = c.state as ShotTaken;
        expect(taken.shots.length, i, reason: 'shot $i should be on screen');
        expect(taken.isLast, i == 4);
        c.continueCapture();
      }

      await waitFor(
        c,
        (s) => s is Decorating,
        limit: const Duration(seconds: 30),
      );
      final decorating = c.state as Decorating;
      expect(decorating.shots.length, 4);
      for (final f in decorating.shots) {
        expect(
          f.existsSync(),
          isTrue,
          reason: 'a shot was never written to disk',
        );
        expect(f.lengthSync(), greaterThan(0));
      }

      // Frames and filters are off (kDecorationsEnabled), so the customer
      // reaches this screen to confirm the strip and nothing else. The
      // choosing API still works underneath — the test exercises it so the
      // path does not rot while the feature is dark.
      c.chooseFrame('pita');
      expect((c.state as Decorating).frameId, 'pita');

      await c.printNow();
      await waitFor(
        c,
        (s) => s is ThankYou,
        limit: const Duration(seconds: 20),
      );

      expect(c.state, isA<ThankYou>());
    },
  );

  test('an unpaid session expires without taking money', () async {
    // autoPay off: nobody ever scans.
    final c = build(api: FakeBoothApi(autoPay: false));
    addTearDown(c.dispose);
    await c.start();
    await c.beginSession();
    await waitFor(c, (s) => s is AwaitingPayment);

    c.cancelBeforePayment();
    expect(
      c.state,
      isA<Idle>(),
      reason: 'cancelling before payment is always allowed',
    );
  });

  test('a paid session cannot be cancelled back to idle', () async {
    final c = build();
    addTearDown(c.dispose);
    await c.start();
    await c.beginSession();
    await waitFor(c, (s) => s.isPaid);

    c.cancelBeforePayment();
    expect(
      c.state,
      isNot(isA<Idle>()),
      reason: 'after payment, cancel must not strand a paying customer',
    );
  });

  test(
    'a printer failure shows the session code, not an apology',
    timeout: _slow,
    () async {
      final c = build(
        printer: FakePrinter(
          duration: const Duration(milliseconds: 200),
          failAfter: 0.4, // paper runs out mid-strip
        ),
      );
      addTearDown(c.dispose);
      await c.start();
      await c.beginSession();
      await pressThroughShots(c);
      await waitFor(
        c,
        (s) => s is Decorating,
        limit: const Duration(seconds: 30),
      );
      await c.printNow();
      await waitFor(
        c,
        (s) => s is PrintFailed,
        limit: const Duration(seconds: 20),
      );

      final failed = c.state as PrintFailed;
      // The code is the customer's only way to get what they paid for.
      expect(failed.session.sessionNumber, startsWith('PB-'));
      expect(failed.reason, isNotEmpty);
    },
  );

  test(
    'an offline printer is caught before the strip is composed',
    timeout: _slow,
    () async {
      final c = build(printer: FakePrinter(health: PrinterHealth.offline));
      addTearDown(c.dispose);
      await c.start();
      await c.beginSession();
      await pressThroughShots(c);
      await waitFor(
        c,
        (s) => s is Decorating,
        limit: const Duration(seconds: 30),
      );
      await c.printNow();
      await waitFor(c, (s) => s is PrintFailed);
      expect(c.state, isA<PrintFailed>());
    },
  );
}

/// A booth with no camera must refuse the sale, not take it.
void _noCameraNoSale() {
  test('a dead camera stops the session before any money moves', () async {
    final dir = Directory.systemTemp.createTempSync('pb-nocam');
    addTearDown(() => dir.deleteSync(recursive: true));
    final api = FakeBoothApi();
    final camera = FakeCameraSource();
    final c = BoothController(
      api: api,
      camera: camera,
      printer: FakePrinter(),
      mediaDir: dir,
    );
    addTearDown(c.dispose);
    await c.start();

    // Unplugged, permission revoked, claimed by another app — all the same
    // from here.
    await camera.close();

    c.beginSession();
    await Future<void>.delayed(const Duration(milliseconds: 300));

    expect(
      c.state,
      isA<Fatal>(),
      reason: 'the booth started charging with no way to take a photo',
    );
    expect((c.state as Fatal).message, contains('Kamera'));
  });
}

/// The shutter button must actually cut the countdown short.
void _shootNow() {
  test('pressing the shutter skips the rest of the countdown', () async {
    final dir = Directory.systemTemp.createTempSync('pb-shoot');
    addTearDown(() => dir.deleteSync(recursive: true));
    final c = BoothController(
      api: FakeBoothApi(),
      camera: FakeCameraSource(),
      printer: FakePrinter(),
      mediaDir: dir,
    );
    addTearDown(c.dispose);
    await c.start();

    Future<void> until(bool Function(BoothState) ready, Duration limit) async {
      final deadline = DateTime.now().add(limit);
      while (!ready(c.state)) {
        if (DateTime.now().isAfter(deadline)) {
          fail('timed out waiting; state is ${c.state.runtimeType}');
        }
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
    }

    final began = DateTime.now();
    c.beginSession();
    await until((s) => s is GetReady, const Duration(seconds: 30));

    // Fire immediately. Without this the countdown runs its full length, so
    // reaching the first shot materially faster is the proof.
    c.shootNow();
    await until((s) => s is ShotTaken, const Duration(seconds: 20));
    final elapsed = DateTime.now().difference(began);

    expect((c.state as ShotTaken).shots.length, 1);
    expect(
      elapsed,
      lessThan(Timeouts.shotCountdown + const Duration(seconds: 8)),
      reason: 'the countdown ran to completion despite the shutter press',
    );

    // Outside a countdown it must be inert, not fire a stray shot.
    c.shootNow();
    expect(c.state, isA<ShotTaken>());
  });
}

/// The booth must charge what it advertises.
///
/// The server guarantees this by deriving a session's amount from its own
/// config and never accepting a price from the client. The fake has to keep
/// the same promise, or every screen built against it is built on a lie —
/// which is how the idle screen came to quote Rp 5.000 while the QR asked
/// for Rp 25.000.
void _priceConsistency() {
  test('the session charges exactly what the config advertises', () async {
    final api = FakeBoothApi();
    final config = await api.fetchConfig();
    final session = await api.createSession(idempotencyKey: 'price-check');

    expect(
      session.amountCents,
      config.priceCents,
      reason: 'the QR asks for a different amount than the idle screen quotes',
    );
    expect(
      session.shotsPlanned,
      config.shotsCount,
      reason: 'the booth promises a different number of shots than it takes',
    );
  });
}
