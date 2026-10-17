import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:photoboost/camera/fake_camera_source.dart';
import 'package:photoboost/data/api/fake_booth_api.dart';
import 'package:photoboost/printing/fake_printer.dart';
import 'package:photoboost/printing/printer.dart';
import 'package:photoboost/session/booth_controller.dart';
import 'package:photoboost/session/booth_state.dart';

/// Drives the machine the way a customer does, against the fakes. This is
/// what proves the simulation actually reaches a photo rather than merely
/// looking like it does.
void main() {
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

  test('a customer gets from idle to a printed strip', () async {
    final c = build();
    addTearDown(c.dispose);
    await c.start();
    expect(c.state, isA<Idle>());

    await c.beginSession();
    await waitFor(c, (s) => s is AwaitingPayment);

    // There must be something to scan, or the customer is stuck.
    final waiting = c.state as AwaitingPayment;
    expect(waiting.session.qrString, isNotEmpty);
    expect(waiting.session.amountCents, 2500000);

    await waitFor(c, (s) => s is Paid || s.isPaid);

    // Four shots, each flushed to disk as it is taken.
    await waitFor(
      c,
      (s) => s is Decorating,
      limit: const Duration(seconds: 60),
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

    c.chooseFrame('pita');
    expect((c.state as Decorating).frameId, 'pita');

    c.confirmFrame();
    await waitFor(c, (s) => s is Previewing);

    await c.printNow();
    await waitFor(c, (s) => s is ThankYou, limit: const Duration(seconds: 20));

    expect(c.state, isA<ThankYou>());
  });

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

  test('a printer failure shows the session code, not an apology', () async {
    final c = build(
      printer: FakePrinter(
        duration: const Duration(milliseconds: 200),
        failAfter: 0.4, // paper runs out mid-strip
      ),
    );
    addTearDown(c.dispose);
    await c.start();
    await c.beginSession();
    await waitFor(
      c,
      (s) => s is Decorating,
      limit: const Duration(seconds: 60),
    );
    c.confirmFrame();
    await waitFor(c, (s) => s is Previewing);

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
  });

  test('an offline printer is caught before the strip is composed', () async {
    final c = build(printer: FakePrinter(health: PrinterHealth.offline));
    addTearDown(c.dispose);
    await c.start();
    await c.beginSession();
    await waitFor(
      c,
      (s) => s is Decorating,
      limit: const Duration(seconds: 60),
    );
    c.confirmFrame();
    await waitFor(c, (s) => s is Previewing);

    await c.printNow();
    await waitFor(c, (s) => s is PrintFailed);
    expect(c.state, isA<PrintFailed>());
  });
}
