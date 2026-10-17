import 'package:flutter/material.dart';

import 'colors.dart';

/// The booth runs dark.
///
/// Not a style preference: a photo booth sits under mall lighting with a
/// camera feed behind the UI, and a bright page washes the preview out and
/// reflects off the screen. Dark makes the photo the brightest thing in the
/// room, which is the whole point of the machine.
///
/// The hue is still SellOn's 145, so the booth reads as part of the product
/// rather than a different company's software.
class BoothSurface {
  /// Deepest ground. Near-black with a trace of the brand hue, so it never
  /// looks like a dead pixel field.
  static const base = Color(0xFF07110A);
  static const raised = Color(0xFF0E1B12);
  static const card = Color(0xFF14241A);
  static const border = Color(0xFF1E3326);

  static const textPrimary = Color(0xFFF2F7F3);
  static const textSecondary = Color(0xFFA9BDAF);
  static const textMuted = Color(0xFF6E8375);

  /// Accents, lifted from the brand scale: the mid tones read as muddy on a
  /// dark ground, so the booth leans on 400-500 where the web leans on 600.
  static const accent = SellonColors.brand400;
  static const accentStrong = SellonColors.brand500;
  static const accentSoft = Color(0xFF1B3A24);

  /// The drifting wash behind the idle screen. Brand green first, with a
  /// teal and a deep moss so the blobs read as depth rather than one colour
  /// smeared about.
  static const ambient = <Color>[
    Color(0x4D3BD166), // brand, 30%
    Color(0x3322C7A9), // teal
    Color(0x4014803C), // deep moss
  ];

  /// Glow used behind the primary action, so the one thing to press is the
  /// brightest thing on screen.
  static List<BoxShadow> accentGlow(double strength) => [
    BoxShadow(
      color: SellonColors.brand500.withValues(alpha: 0.35 * strength),
      blurRadius: 40 * strength,
      spreadRadius: 2 * strength,
    ),
  ];
}
