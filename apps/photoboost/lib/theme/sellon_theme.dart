import 'package:flutter/material.dart';

import 'colors.dart';
import 'typography.dart';

/// Assembles the SellOn look into a ThemeData for the booth.
///
/// Light only: a photo booth lives under mall lighting and a dark kiosk reads
/// as switched off.
ThemeData buildSellonTheme() {
  final base = ThemeData.light(useMaterial3: true);
  return base.copyWith(
    scaffoldBackgroundColor: SellonColors.neutral50,
    colorScheme: base.colorScheme.copyWith(
      primary: SellonColors.brand600,
      onPrimary: Colors.white,
      secondary: SellonColors.brand500,
      surface: Colors.white,
      onSurface: SellonColors.neutral900,
      error: SellonColors.danger,
    ),
    textTheme: base.textTheme.copyWith(
      displayLarge: SellonText.displayXl,
      headlineLarge: SellonText.h1,
      headlineMedium: SellonText.h2,
      titleLarge: SellonText.h3,
      bodyLarge: SellonText.body,
      labelLarge: SellonText.label,
    ),
    splashFactory: InkRipple.splashFactory,
  );
}
