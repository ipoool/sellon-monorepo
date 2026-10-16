import 'package:flutter/material.dart';

/// SellOn brand tokens, converted from the OKLCH values in
/// web/src/app/globals.css by tool/oklch_to_hex.dart.
///
/// Converted at authoring time rather than runtime: these are constants, and
/// recomputing an OKLab matrix on every build would be work for nothing. The
/// OKLCH source stays in a comment on each line so a token can always be
/// traced back to the web theme.
///
/// Verified against Chrome: rasterising oklch(0.71 0.18 145) gives #48BD54,
/// which is what brand500 reads below. (globals.css carries an older comment
/// claiming "≈ #3CC152" — that approximation is wrong; the OKLCH value wins.)
class SellonColors {
  static const Color brand50 = Color(0xFFEBFAEB); // oklch(0.97 0.025 145.0)
  static const Color brand100 = Color(0xFFD3F7D3); // oklch(0.94 0.06 145.0)
  static const Color brand200 = Color(0xFFA9EBAB); // oklch(0.88 0.11 145.0)
  static const Color brand300 = Color(0xFF7EDA82); // oklch(0.81 0.15 145.0)
  static const Color brand400 = Color(0xFF61CC69); // oklch(0.76 0.17 145.0)
  static const Color brand500 = Color(0xFF48BD54); // oklch(0.71 0.18 145.0)
  static const Color brand600 = Color(0xFF2B9C3A); // oklch(0.61 0.17 145.0)
  static const Color brand700 = Color(0xFF167B26); // oklch(0.51 0.15 145.0)
  static const Color brand800 = Color(0xFF0E5A1A); // oklch(0.41 0.12 145.0)
  static const Color brand900 = Color(0xFF073B0F); // oklch(0.31 0.09 145.0)
  static const Color brand950 = Color(0xFF031F05); // oklch(0.21 0.06 145.0)
  static const Color neutral0 = Color(0xFFFFFFFF); // oklch(1.0 0.0 0.0)
  static const Color neutral50 = Color(0xFFF9FAFB); // oklch(0.985 0.002 250.0)
  static const Color neutral100 = Color(0xFFF4F5F7); // oklch(0.97 0.003 250.0)
  static const Color neutral200 = Color(0xFFE5E8EB); // oklch(0.93 0.005 250.0)
  static const Color neutral300 = Color(0xFFD1D5D9); // oklch(0.87 0.007 250.0)
  static const Color neutral400 = Color(0xFF9DA2A8); // oklch(0.71 0.01 250.0)
  static const Color neutral500 = Color(0xFF6C7278); // oklch(0.55 0.012 250.0)
  static const Color neutral600 = Color(0xFF4E5359); // oklch(0.44 0.012 250.0)
  static const Color neutral700 = Color(0xFF393E42); // oklch(0.36 0.01 250.0)
  static const Color neutral800 = Color(0xFF24272A); // oklch(0.27 0.008 250.0)
  static const Color neutral900 = Color(0xFF121416); // oklch(0.19 0.006 250.0)
  static const Color neutral950 = Color(0xFF060709); // oklch(0.13 0.004 250.0)
  static const Color success = Color(0xFF3BA946); // oklch(0.65 0.17 145.0)
  static const Color warning = Color(0xFFEFA831); // oklch(0.78 0.15 75.0)
  static const Color danger = Color(0xFFDE3B3D); // oklch(0.6 0.2 25.0)
  static const Color info = Color(0xFF009CCE); // oklch(0.65 0.14 230.0)
}
