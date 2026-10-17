import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'camera/camera_source.dart';
import 'camera/fake_camera_source.dart';
import 'data/api/booth_api.dart';
import 'data/api/fake_booth_api.dart';
import 'features/booth_screen.dart';
import 'printing/fake_printer.dart';
import 'printing/printer.dart';
import 'session/booth_controller.dart';
import 'theme/sellon_theme.dart';

/// Demo mode runs the whole flow against fakes: no backend, no Midtrans key,
/// no webcam, no printer. It exists so the booth can be shown and exercised
/// end to end before any of that hardware is bought.
///
///   flutter run -d macos                      # demo (default off-device)
///   flutter run -d macos --dart-define=DEMO=false
const kDemo = bool.fromEnvironment('DEMO', defaultValue: true);

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Landscape only: the booth is a fixed installation, and a rotated kiosk is
  // a broken kiosk.
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);

  final mediaDir = Directory('${Directory.systemTemp.path}/photoboost-media');
  await mediaDir.create(recursive: true);

  final BoothApi api = FakeBoothApi();
  final CameraSource camera = FakeCameraSource();
  final BoothPrinter printer = FakePrinter();

  final controller = BoothController(
    api: api,
    camera: camera,
    printer: printer,
    mediaDir: mediaDir,
  );
  await controller.start();

  runApp(PhotoBoostApp(controller: controller));
}

class PhotoBoostApp extends StatelessWidget {
  const PhotoBoostApp({super.key, required this.controller});

  final BoothController controller;

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'PhotoBoost',
    debugShowCheckedModeBanner: false,
    theme: buildSellonTheme(),
    home: BoothScreen(controller: controller),
  );
}
