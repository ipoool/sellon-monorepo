// Dev-only: converts the OKLCH tokens in web/src/app/globals.css into the
// const Colors in lib/theme/colors.dart. Not shipped with the app.
//
//   dart run tool/oklch_to_hex.dart
//
// Flutter has no OKLCH, so the conversion happens at authoring time and the
// result is pasted in as hex. Doing it at runtime would spend CPU on every
// build to recompute a constant.
//
// Out-of-gamut colours are handled by reducing chroma until they fit, NOT by
// clamping the RGB channels. Several brand steps sit at C=0.15-0.18 near the
// sRGB boundary, and clamping a channel there shifts the hue visibly — the
// green would drift toward yellow exactly where the brand is most saturated.

import 'dart:io';
import 'dart:math' as math;

class Oklch {
  const Oklch(this.l, this.c, this.h);
  final double l; // 0..1
  final double c; // chroma
  final double h; // degrees
}

/// OKLab -> linear sRGB, per Björn Ottosson's matrices.
List<double> _oklabToLinearSrgb(double L, double a, double b) {
  final l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  final m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  final s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  final l = l_ * l_ * l_;
  final m = m_ * m_ * m_;
  final s = s_ * s_ * s_;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

double _linearToSrgb(double x) {
  if (x <= 0.0031308) return 12.92 * x;
  return 1.055 * math.pow(x, 1 / 2.4).toDouble() - 0.055;
}

bool _inGamut(List<double> rgb) =>
    rgb.every((v) => v >= -0.0001 && v <= 1.0001);

/// Converts to #RRGGBB, reducing chroma by binary search when the colour
/// falls outside sRGB. Lightness and hue are preserved; only saturation
/// gives way, which is the least visible compromise.
String oklchToHex(Oklch col) {
  final rad = col.h * math.pi / 180.0;
  double lo = 0.0, hi = col.c;

  List<double> at(double c) =>
      _oklabToLinearSrgb(col.l, c * math.cos(rad), c * math.sin(rad));

  var rgb = at(col.c);
  if (!_inGamut(rgb)) {
    for (var i = 0; i < 40; i++) {
      final mid = (lo + hi) / 2;
      if (_inGamut(at(mid))) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    rgb = at(lo);
  }

  final hex = rgb.map((v) {
    final srgb = _linearToSrgb(v.clamp(0.0, 1.0));
    final b = (srgb * 255).round().clamp(0, 255);
    return b.toRadixString(16).padLeft(2, '0').toUpperCase();
  }).join();
  return '#$hex';
}

const _tokens = <String, Oklch>{
  'brand50': Oklch(0.97, 0.025, 145),
  'brand100': Oklch(0.94, 0.06, 145),
  'brand200': Oklch(0.88, 0.11, 145),
  'brand300': Oklch(0.81, 0.15, 145),
  'brand400': Oklch(0.76, 0.17, 145),
  'brand500': Oklch(0.71, 0.18, 145),
  'brand600': Oklch(0.61, 0.17, 145),
  'brand700': Oklch(0.51, 0.15, 145),
  'brand800': Oklch(0.41, 0.12, 145),
  'brand900': Oklch(0.31, 0.09, 145),
  'brand950': Oklch(0.21, 0.06, 145),
  'neutral0': Oklch(1.00, 0, 0),
  'neutral50': Oklch(0.985, 0.002, 250),
  'neutral100': Oklch(0.97, 0.003, 250),
  'neutral200': Oklch(0.93, 0.005, 250),
  'neutral300': Oklch(0.87, 0.007, 250),
  'neutral400': Oklch(0.71, 0.01, 250),
  'neutral500': Oklch(0.55, 0.012, 250),
  'neutral600': Oklch(0.44, 0.012, 250),
  'neutral700': Oklch(0.36, 0.01, 250),
  'neutral800': Oklch(0.27, 0.008, 250),
  'neutral900': Oklch(0.19, 0.006, 250),
  'neutral950': Oklch(0.13, 0.004, 250),
  'success': Oklch(0.65, 0.17, 145),
  'warning': Oklch(0.78, 0.15, 75),
  'danger': Oklch(0.60, 0.20, 25),
  'info': Oklch(0.65, 0.14, 230),
};

void main() {
  // Anchor, verified by rasterising oklch(0.71 0.18 145) in Chrome and
  // reading the pixel back. NOTE: globals.css carries a comment saying
  // "≈ #3CC152" next to this token — that approximation is wrong by a
  // visible amount, and the OKLCH value is the one that ships. If this
  // check drifts, the conversion is broken and every token is suspect.
  const expected = '#48BD54';
  final got = oklchToHex(_tokens['brand500']!);
  stderr.writeln(got == expected
      ? 'anchor ok: brand500 = $got'
      : 'ANCHOR MISMATCH: brand500 = $got, expected $expected');

  _tokens.forEach((name, c) {
    final hex = oklchToHex(c);
    final argb = '0xFF${hex.substring(1)}';
    print("  static const Color $name = Color($argb); "
        "// oklch(${c.l} ${c.c} ${c.h})");
  });
}
