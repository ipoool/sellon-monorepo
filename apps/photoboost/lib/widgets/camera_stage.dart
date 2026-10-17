import 'package:flutter/material.dart';

import '../camera/camera_source.dart';
import '../theme/booth_surface.dart';
import '../theme/typography.dart';

/// The full-bleed camera backdrop the capture screens sit on.
///
/// Built now, before the USB webcam question is settled, because the layout
/// has to be designed around a live feed rather than retrofitted onto one:
/// every capture screen is an overlay on this, and overlays read completely
/// differently against a moving image than against a flat panel.
///
/// Until a real preview exists it renders a dark stage with a soft vignette,
/// which is also exactly what should appear if the camera drops mid-session.
class CameraStage extends StatelessWidget {
  const CameraStage({super.key, this.source, this.mirror = true, this.child});

  /// When a source eventually exposes a preview texture, it goes here.
  final CameraSource? source;

  /// Booths mirror by default: people expect to move left and see themselves
  /// move left, the way a mirror behaves rather than the way a camera does.
  final bool mirror;

  final Widget? child;

  @override
  Widget build(BuildContext context) {
    final available = source?.isAvailable ?? false;
    final preview = source?.buildPreview(mirror: mirror);
    return Stack(
      fit: StackFit.expand,
      children: [
        const ColoredBox(color: Color(0xFF05100A)),
        // The live feed when there is one. Without it the stage falls back
        // to a dark gradient — which is also exactly what should appear if
        // the camera drops mid-session, so there is no separate error state
        // to build.
        if (preview != null)
          Positioned.fill(child: preview)
        else
          Center(
            child: Transform.flip(
              flipX: mirror,
              child: DecoratedBox(
                decoration: const BoxDecoration(
                  gradient: RadialGradient(
                    radius: 0.9,
                    colors: [Color(0xFF16301F), Color(0xFF05100A)],
                  ),
                ),
                child: const SizedBox.expand(),
              ),
            ),
          ),
        if (!available)
          Align(
            alignment: Alignment.topCenter,
            child: Padding(
              padding: const EdgeInsets.only(top: 24),
              child: _CameraNotice(),
            ),
          ),
        // Vignette, so white overlay text stays legible over a bright feed.
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0x99000000), Color(0x22000000), Color(0xCC000000)],
              stops: [0, 0.45, 1],
            ),
          ),
          child: SizedBox.expand(),
        ),
        ?child,
      ],
    );
  }
}

class _CameraNotice extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
    decoration: BoxDecoration(
      color: Colors.black.withValues(alpha: 0.5),
      borderRadius: BorderRadius.circular(999),
      border: Border.all(color: BoothSurface.border),
    ),
    child: Text(
      'Pratinjau kamera belum aktif',
      style: SellonText.label.copyWith(color: BoothSurface.textMuted),
    ),
  );
}

/// "Sisa waktu 00:39" — the countdown every post-payment screen carries, so a
/// customer always knows the booth is still theirs and for how long.
class RemainingTime extends StatelessWidget {
  const RemainingTime({
    super.key,
    required this.seconds,
    this.label = 'Sisa waktu',
  });

  final int seconds;
  final String label;

  @override
  Widget build(BuildContext context) {
    final m = (seconds ~/ 60).toString().padLeft(2, '0');
    final s = (seconds % 60).toString().padLeft(2, '0');
    final urgent = seconds <= 15;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(
          label,
          style: SellonText.label.copyWith(color: BoothSurface.textMuted),
        ),
        Text(
          '$m:$s',
          style: SellonText.h2.copyWith(
            color: urgent ? const Color(0xFFFF8A7A) : BoothSurface.textPrimary,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
      ],
    );
  }
}
