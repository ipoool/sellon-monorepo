import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'camera/camera_source.dart';
import 'camera/device_camera_source.dart';
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

/// Use the drawn placeholder camera instead of the device's own.
///
/// Defaults to the real camera even in demo mode, because the preview is the
/// thing most worth looking at when demoing. Pass
/// --dart-define=FAKE_CAMERA=true on a machine with no camera.
const kUseFakeCamera = bool.fromEnvironment('FAKE_CAMERA');

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Both orientations. A booth is a fixed installation, but which way it is
  // fixed is the operator's decision — a tall enclosure in a mall corridor
  // is as ordinary as a wide one on a table, and locking to landscape made
  // that a hardware problem instead of a setting.
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);
  // edgeToEdge, not immersiveSticky.
  //
  // immersiveSticky re-asserts itself whenever anything else takes the
  // window — including the soft keyboard. On the pairing screen that became
  // a fight the IME kept losing (onFailed at PHASE_CLIENT_VIEW_SERVED), and
  // the retry loop starved input dispatch until Android killed the app.
  //
  // A booth still needs the system bars out of the way; edgeToEdge draws
  // under them without claiming exclusive ownership of the window. True
  // kiosk lockdown is lock-task's job, not a UI mode's.
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);

  runApp(const PhotoBoostApp());
}

class PhotoBoostApp extends StatelessWidget {
  const PhotoBoostApp({super.key, this.controller, this.store});

  /// Passed through to BoothHost; see its own doc.
  final CredentialStore? store;

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
          : BoothHost(store: store),
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
  const BoothHost({super.key, this.store});

  /// Supplied by tests so the pairing gate can be exercised against a temp
  /// directory instead of the platform's app-support path.
  final CredentialStore? store;

  @override
  State<BoothHost> createState() => _BoothHostState();
}

class _BoothHostState extends State<BoothHost> {
  late final CredentialStore _store = widget.store ?? CredentialStore();

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
    // Pairing gates everything, demo included. A booth that has not been
    // claimed by an operator is not a booth yet, and showing it the idle
    // screen invites a customer to pay into a tablet nobody is tracking.
    // Demo mode changes WHO answers the pairing call, not whether it happens.
    final creds = await _store.load();
    if (creds == null) {
      if (mounted) setState(() => _loading = false);
      return;
    }
    await _startSelling(_apiFor(creds));
  }

  /// In demo mode every call is answered by the fake, so the whole flow runs
  /// with no backend — but only after the tablet has been paired, exactly
  /// like a real one.
  BoothApi _apiFor(DeviceCredentials creds) => kDemo
      ? FakeBoothApi()
      : HttpBoothApi(
          credentials: creds,
          appVersion: kAppVersion,
          onUnauthorized: () => _unpair(creds.booth),
        );

  Future<void> _startSelling(BoothApi api) async {
    // The tablet's own camera, with a live preview. Demo mode keeps the fake
    // so the flow still runs on a desktop with no camera at all.
    //
    // The printer is still a fake: the Bluetooth transport has not landed.
    final CameraSource camera = kUseFakeCamera
        ? FakeCameraSource()
        : DeviceCameraSource();
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
    await _startSelling(_apiFor(result.credentials));
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
      pair: kDemo ? fakePairDevice : pairDevice,
      hint: kDemo ? 'Mode demo — ketik $kDemoPairingCode' : null,
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
