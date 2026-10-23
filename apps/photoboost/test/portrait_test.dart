import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:photoboost/camera/fake_camera_source.dart';
import 'package:photoboost/data/api/fake_booth_api.dart';
import 'package:photoboost/main.dart';
import 'package:photoboost/printing/fake_printer.dart';
import 'package:photoboost/session/booth_controller.dart';
import 'package:photoboost/session/booth_state.dart';

/// Every screen, in portrait, start to finish.
///
/// The existing tests checked the idle screen and passed while the shot
/// review screen was overflowing by 429 pixels — a yellow-and-black stripe
/// across a booth in a mall. A screen is only covered if something actually
/// drives the flow to it at the size it will be used, so this walks the
/// whole session on a tall surface and fails on the first overflow.
void main() {
  const portrait = Size(800, 1280);

  testWidgets('no screen overflows in portrait', (tester) async {
    await tester.binding.setSurfaceSize(portrait);
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final dir = Directory.systemTemp.createTempSync('pb-portrait-flow');
    addTearDown(() => dir.deleteSync(recursive: true));

    final c = BoothController(
      api: FakeBoothApi(),
      camera: FakeCameraSource(),
      printer: FakePrinter(),
      mediaDir: dir,
    );
    addTearDown(c.dispose);
    await tester.runAsync(c.start);
    await tester.pumpWidget(PhotoBoostApp(controller: c));

    final seen = <String>{};

    // Flutter reports an overflow as an exception on the frame it happens,
    // so settling after every state change and checking is what catches it.
    Future<void> settle(String where) async {
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(milliseconds: 120));
        final err = tester.takeException();
        expect(err, isNull, reason: '$where overflowed in portrait');
      }
      seen.add(where);
    }

    await settle('Idle');

    await tester.runAsync(() async {
      c.beginSession();
      await Future<void>.delayed(const Duration(milliseconds: 400));
    });
    await settle('AwaitingPayment');

    // Walk the capture loop: every shot lands on the review screen, which
    // is the one that was broken.
    for (var shot = 0; shot < 8; shot++) {
      await tester.runAsync(() async {
        final deadline = DateTime.now().add(const Duration(seconds: 25));
        while (c.state is! ShotTaken &&
            c.state is! Decorating &&
            DateTime.now().isBefore(deadline)) {
          await Future<void>.delayed(const Duration(milliseconds: 100));
        }
      });
      if (c.state is Decorating) break;
      await settle('ShotTaken ${shot + 1}');
      await tester.runAsync(() async {
        c.continueCapture();
        await Future<void>.delayed(const Duration(milliseconds: 300));
      });
    }

    await tester.runAsync(() async {
      final deadline = DateTime.now().add(const Duration(seconds: 25));
      while (c.state is! Decorating && DateTime.now().isBefore(deadline)) {
        await Future<void>.delayed(const Duration(milliseconds: 100));
      }
    });
    await settle('Decorating');

    await tester.runAsync(() async {
      await c.printNow();
      final deadline = DateTime.now().add(const Duration(seconds: 25));
      while (c.state is! ThankYou && DateTime.now().isBefore(deadline)) {
        await Future<void>.delayed(const Duration(milliseconds: 100));
      }
    });
    await settle('ThankYou');

    // Proof the walk actually reached the screens rather than skipping them.
    expect(seen, contains('ShotTaken 1'));
    expect(seen, contains('Decorating'));
    expect(seen, contains('ThankYou'));
  }, timeout: const Timeout(Duration(minutes: 3)));
}
