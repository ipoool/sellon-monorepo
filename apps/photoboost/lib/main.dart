import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'camera/camera_source.dart';
import 'camera/fake_camera_source.dart';
import 'data/api/booth_api.dart';
import 'data/api/fake_booth_api.dart';
import 'data/api/http_booth_api.dart';
import 'data/device_credentials.dart';
import 'features/booth_screen.dart';
import 'features/pairing_screen.dart';
import 'printing/fake_printer.dart';
import 'printing/printer.dart';
import 'session/booth_controller.dart';
import 'theme/booth_surface.dart';
import 'theme/sellon_theme.dart';
import 'theme/typography.dart';

/// Demo mode runs the whole flow against fakes: no backend, no Midtrans key,
/// no webcam, no printer, and no pairing. It exists so the booth can be shown
/// and exercised end to end before any of that hardware is bought.
///
///   flutter run -d macos                      # demo (default off-device)
///   flutter run -d macos --dart-define=DEMO=false
const kDemo = bool.fromEnvironment('DEMO', defaultValue: true);

/// Where a paired booth talks to. Compiled in rather than typed at the booth:
/// an operator who can point a tablet at an arbitrary host is one phishing
/// call away from pairing the fleet to someone else's server.
const kApiBase = String.fromEnvironment(
  'API_BASE',
  defaultValue: 'https://sellon.id',
);

const kAppVersion = String.fromEnvironment(
  'APP_VERSION',
  defaultValue: '0.1.0',
);

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Landscape only: the booth is a fixed installation, and a rotated kiosk is
  // a broken kiosk.
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);

  runApp(const PhotoBoostApp());
}

class PhotoBoostApp extends StatelessWidget {
  const PhotoBoostApp({super.key, this.controller});

  /// Supplied by tests, which build their own controller over fakes and have
  /// no business going through pairing or credential storage to reach a
  /// screen. In the app itself this is null and BoothHost decides.
  final BoothController? controller;

  @override
  Widget build(BuildContext context) {
    final injected = controller;
    return MaterialApp(
      title: 'PhotoBoost',
      debugShowCheckedModeBanner: false,
      theme: buildSellonTheme(),
      home: injected != null
          ? BoothScreen(controller: injected)
          : const BoothHost(),
    );
  }
}

/// Decides what this tablet is.
///
/// Three states, and the booth moves between them without anyone restarting
/// the app: unpaired (show the keypad), starting up, and selling. The one
/// that matters operationally is the transition back — an admin revokes a
/// token, the next call answers 401, and the tablet returns to the keypad
/// instead of sitting on a screen that quietly no longer works.
class BoothHost extends StatefulWidget {
  const BoothHost({super.key});

  @override
  State<BoothHost> createState() => _BoothHostState();
}

class _BoothHostState extends State<BoothHost> {
  final _store = CredentialStore();

  bool _loading = true;
  BoothController? _controller;
  BoothIdentity? _previousBooth;
  String? _startupError;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _boot() async {
    if (kDemo) {
      await _startSelling(FakeBoothApi());
      return;
    }
    final creds = await _store.load();
    if (creds == null) {
      if (mounted) setState(() => _loading = false);
      return;
    }
    await _startSelling(
      HttpBoothApi(
        credentials: creds,
        appVersion: kAppVersion,
        onUnauthorized: () => _unpair(creds.booth),
      ),
    );
  }

  Future<void> _startSelling(BoothApi api) async {
    // Camera and printer are still fakes: the hardware spike has not landed,
    // and the rest of the app is deliberately buildable without it.
    final CameraSource camera = FakeCameraSource();
    final BoothPrinter printer = FakePrinter();

    final mediaDir = Directory('${Directory.systemTemp.path}/photoboost-media');
    await mediaDir.create(recursive: true);

    final controller = BoothController(
      api: api,
      camera: camera,
      printer: printer,
      mediaDir: mediaDir,
    );
    try {
      await controller.start();
    } catch (e) {
      // A booth that cannot reach its config has nothing to sell. Say so
      // plainly rather than opening on an idle screen that takes money and
      // then fails.
      if (!mounted) return;
      controller.dispose();
      setState(() {
        _loading = false;
        _startupError = '$e';
      });
      return;
    }
    if (!mounted) {
      controller.dispose();
      return;
    }
    setState(() {
      _controller = controller;
      _loading = false;
      _startupError = null;
    });
  }

  /// The token was revoked, or never valid against this server. Drop it and
  /// go back to the keypad, naming the booth this tablet used to be.
  Future<void> _unpair(BoothIdentity was) async {
    await _store.clear();
    if (!mounted) return;
    final old = _controller;
    setState(() {
      _controller = null;
      _previousBooth = was;
      _loading = false;
    });
    old?.dispose();
  }

  Future<void> _onPaired(PairingResult result) async {
    await _store.save(result.credentials);
    if (!mounted) return;
    setState(() {
      _loading = true;
      _previousBooth = null;
    });
    await _startSelling(
      HttpBoothApi(
        credentials: result.credentials,
        appVersion: kAppVersion,
        onUnauthorized: () => _unpair(result.credentials.booth),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    if (controller != null) return BoothScreen(controller: controller);
    if (_loading) return const _Splash();
    if (_startupError != null) {
      return _StartupFailure(
        message: _startupError!,
        onRetry: () {
          setState(() {
            _loading = true;
            _startupError = null;
          });
          _boot();
        },
      );
    }
    return PairingScreen(
      baseUrl: kApiBase,
      appVersion: kAppVersion,
      previousBooth: _previousBooth,
      onPaired: (r) => _onPaired(r),
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) => const Scaffold(
    backgroundColor: BoothSurface.base,
    body: Center(
      child: SizedBox(
        width: 36,
        height: 36,
        child: CircularProgressIndicator(
          strokeWidth: 3,
          color: BoothSurface.accent,
        ),
      ),
    ),
  );
}

/// Shown when a paired booth cannot start. The booth code is deliberately not
/// cleared here: this is a server or network problem, not a revoked token,
/// and forgetting the pairing would turn an outage into a site visit.
class _StartupFailure extends StatelessWidget {
  const _StartupFailure({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: BoothSurface.base,
    body: Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.cloud_off_rounded,
              size: 48,
              color: BoothSurface.textMuted,
            ),
            const SizedBox(height: 20),
            Text(
              'Booth belum bisa mulai',
              style: SellonText.h2.copyWith(color: BoothSurface.textPrimary),
            ),
            const SizedBox(height: 10),
            Text(
              'Tidak bisa memuat pengaturan dari server. Cek koneksi '
              'internet booth, lalu coba lagi.',
              textAlign: TextAlign.center,
              style: SellonText.body.copyWith(
                color: BoothSurface.textSecondary,
              ),
            ),
            const SizedBox(height: 24),
            FilledButton(onPressed: onRetry, child: const Text('Coba lagi')),
          ],
        ),
      ),
    ),
  );
}
