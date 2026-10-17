import 'package:flutter/material.dart';

import 'booth_surface.dart';
import 'colors.dart';
import 'typography.dart';

/// Assembles the SellOn look into a ThemeData for the booth.
///
/// Dark: the booth shows a camera feed behind its UI, and a bright page
/// washes the preview out and reflects off the screen under mall lighting.
/// The brand hue is unchanged, so it still reads as SellOn.
ThemeData buildSellonTheme() {
  final base = ThemeData.dark(useMaterial3: true);
  return base.copyWith(
    scaffoldBackgroundColor: BoothSurface.base,
    colorScheme: base.colorScheme.copyWith(
      primary: BoothSurface.accentStrong,
      onPrimary: Colors.white,
      secondary: BoothSurface.accent,
      surface: BoothSurface.card,
      onSurface: BoothSurface.textPrimary,
      error: SellonColors.danger,
    ),
    textTheme: base.textTheme.copyWith(
      displayLarge: SellonText.displayXl.copyWith(
        color: BoothSurface.textPrimary,
      ),
      headlineLarge: SellonText.h1.copyWith(color: BoothSurface.textPrimary),
      headlineMedium: SellonText.h2.copyWith(color: BoothSurface.textPrimary),
      titleLarge: SellonText.h3.copyWith(color: BoothSurface.textPrimary),
      bodyLarge: SellonText.body.copyWith(color: BoothSurface.textSecondary),
      labelLarge: SellonText.label.copyWith(color: BoothSurface.textMuted),
    ),
    splashFactory: InkRipple.splashFactory,
  );
}
