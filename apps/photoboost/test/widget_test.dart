import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:photoboost/camera/fake_camera_source.dart';
import 'package:photoboost/data/api/fake_booth_api.dart';
import 'package:photoboost/main.dart';
import 'package:photoboost/printing/fake_printer.dart';
import 'package:photoboost/session/booth_controller.dart';

void main() {
  testWidgets('idle screen invites a passer-by to start', (tester) async {
    // A tablet, not a phone: the layout assumes landscape at this size.
    await tester.binding.setSurfaceSize(const Size(1280, 800));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final controller = BoothController(
      api: FakeBoothApi(),
      camera: FakeCameraSource(),
      printer: FakePrinter(),
      mediaDir: Directory.systemTemp.createTempSync('pb-test'),
    );
    addTearDown(controller.dispose);

    await tester.pumpWidget(PhotoBoostApp(controller: controller));
    // The idle screen stages itself in; pump past the entrance animation.
    // (Not pumpAndSettle: the ambient animations never settle by design.)
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }

    expect(find.text('PHOTO BOOTH'), findsOneWidget);
    expect(find.text('Mulai'), findsOneWidget);
    // The four steps are the whole promise; losing one would leave a customer
    // unsure what they are paying for.
    expect(find.text('Scan & bayar'), findsOneWidget);
    expect(find.text('4 kali foto'), findsOneWidget);
    expect(find.text('Pilih bingkai'), findsOneWidget);
    expect(find.text('Ambil cetakan'), findsOneWidget);
  });
}
