import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'theme/colors.dart';
import 'theme/sellon_theme.dart';
import 'theme/shadows.dart';
import 'theme/typography.dart';
import 'widgets/pill_button.dart';
import 'widgets/tinted_panel.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Landscape only: the booth is a fixed installation and a rotated kiosk is
  // a broken kiosk.
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  runApp(const PhotoBoostApp());
}

class PhotoBoostApp extends StatelessWidget {
  const PhotoBoostApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'PhotoBoost',
    debugShowCheckedModeBanner: false,
    theme: buildSellonTheme(),
    home: const IdleScreen(),
  );
}

/// The attract screen. Everything else in the flow is still being built; this
/// is what a passer-by sees, and it is already the real theme rather than a
/// placeholder, so the brand work can be judged on a device.
class IdleScreen extends StatelessWidget {
  const IdleScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // Brand wash, the same radial the web hero uses.
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: const Alignment(0, -1.1),
                  radius: 1.4,
                  colors: [
                    SellonColors.brand100.withValues(alpha: 0.85),
                    SellonColors.neutral50,
                  ],
                ),
              ),
            ),
          ),
          SafeArea(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 900),
                child: Padding(
                  padding: const EdgeInsets.all(SellonSpacing.lg),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text('PHOTO BOOTH', style: SellonText.eyebrow),
                      const SizedBox(height: SellonSpacing.sm),
                      Text(
                        'Foto seru,\nlangsung cetak.',
                        textAlign: TextAlign.center,
                        style: SellonText.displayXl,
                      ),
                      const SizedBox(height: SellonSpacing.md),
                      Text(
                        'Bayar pakai QRIS, ambil 4 foto, pilih bingkai.',
                        textAlign: TextAlign.center,
                        style: SellonText.body,
                      ),
                      const SizedBox(height: SellonSpacing.xl),
                      const _Steps(),
                      const SizedBox(height: SellonSpacing.xl),
                      PillButton(
                        label: 'Mulai',
                        icon: Icons.photo_camera_rounded,
                        minWidth: 320,
                        // Wired up once the session controller lands.
                        onPressed: () {},
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Steps extends StatelessWidget {
  const _Steps();

  static const _items = [
    (Icons.qr_code_rounded, 'Scan & bayar'),
    (Icons.photo_camera_rounded, '4 kali foto'),
    (Icons.auto_awesome_rounded, 'Pilih bingkai'),
    (Icons.print_rounded, 'Ambil cetakan'),
  ];

  @override
  Widget build(BuildContext context) => TintedPanel(
    padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 28),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        for (final (icon, label) in _items)
          Column(
            children: [
              IconChip(icon: icon),
              const SizedBox(height: SellonSpacing.sm),
              Text(label, style: SellonText.label),
            ],
          ),
      ],
    ),
  );
}
