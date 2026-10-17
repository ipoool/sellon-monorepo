import 'package:flutter/material.dart';

import 'booth_surface.dart';
import 'colors.dart';

/// Type scale for a 10-12" tablet read at arm's length, so everything is
/// larger than the web scale it descends from.
///
/// NOTE: Plus Jakarta Sans is NOT bundled yet — pubspec has no fonts section,
/// so this family name currently resolves to the platform default (Roboto on
/// the Android tablet). It must be bundled before the first booth ships: the
/// kiosk has to work with a dead network, so fetching at runtime is not an
/// option, and the booth should not be the one screen in the product wearing
/// a different typeface.
///
/// `fontVariations` is set alongside `fontWeight` because the bundled face is
/// a variable font — without the explicit axis some weights silently render
/// at the default.
///
/// Default colours are for the DARK booth surface, because that is what the
/// whole app runs on. They used to inherit the web scale's near-black, which
/// rendered the idle headline invisible against the booth's own background —
/// a style that reads correctly in a design file and not at all in a mall.
/// The few places that draw on paper-white (the strip preview, the sample
/// card) override explicitly.
class SellonText {
  static const _family = 'PlusJakartaSans';

  static TextStyle _s({
    required double size,
    required int weight,
    required double spacing,
    double height = 1.3,
    Color color = BoothSurface.textPrimary,
  }) => TextStyle(
    fontFamily: _family,
    fontSize: size,
    height: height,
    letterSpacing: size * spacing,
    color: color,
    fontWeight: FontWeight.values[(weight ~/ 100) - 1],
    fontVariations: [FontVariation('wght', weight.toDouble())],
  );

  /// Idle-screen hero. Read from two metres away.
  static final displayXl = _s(
    size: 64,
    weight: 700,
    spacing: -0.03,
    height: 1.05,
  );
  static final h1 = _s(size: 40, weight: 700, spacing: -0.025, height: 1.1);
  static final h2 = _s(size: 28, weight: 700, spacing: -0.02, height: 1.15);
  static final h3 = _s(size: 22, weight: 700, spacing: -0.015, height: 1.25);

  static final body = _s(
    size: 18,
    weight: 400,
    spacing: 0,
    height: 1.5,
    color: BoothSurface.textSecondary,
  );
  static final bodyStrong = _s(size: 18, weight: 700, spacing: -0.015);

  /// Small uppercase label. 600, not 700 — the same distinction the web
  /// theme makes between a label and a heading.
  static final label = _s(
    size: 13,
    weight: 600,
    spacing: 0.06,
    color: BoothSurface.textMuted,
  );

  static final eyebrow = _s(
    size: 11,
    weight: 700,
    spacing: 0.14,
    // brand400, not the web's 700: the booth's own note says mid tones go
    // muddy on a dark ground. The sample strip's caption sits on paper-white
    // and overrides this back to 700.
    color: SellonColors.brand400,
  );

  static final button = _s(size: 18, weight: 700, spacing: -0.01);

  /// Monospaced-feel figure for prices and countdowns. Tabular so a counting
  /// number does not make the layout twitch.
  static final figure = _s(size: 56, weight: 700, spacing: -0.03, height: 1.0);
}
