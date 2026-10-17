import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Renders a QR payload locally.
///
/// Local rendering rather than an image URL is deliberate: the booth is
/// unattended, and a flaky route to the payment provider's CDN must never
/// leave a customer staring at a blank square with their phone out.
///
/// This is a visual stand-in with correct structure (finder patterns, quiet
/// zone, module grid) derived from the payload — enough to build and
/// demonstrate the screen. Before any real money flows it must be replaced
/// with a proper encoder (`pretty_qr_code`), because a QR that merely looks
/// right is worse than none at all.
class QrView extends StatelessWidget {
  const QrView({super.key, required this.data, this.size = 280});

  final String data;
  final double size;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: size,
    height: size,
    child: CustomPaint(painter: _QrPainter(data)),
  );
}

class _QrPainter extends CustomPainter {
  _QrPainter(this.data);
  final String data;

  static const _modules = 33; // version 4-ish grid

  @override
  void paint(Canvas canvas, Size size) {
    final quiet = size.width * 0.06;
    final grid = size.width - quiet * 2;
    final m = grid / _modules;
    final dark = Paint()..color = Colors.black;

    canvas.drawRect(Offset.zero & size, Paint()..color = Colors.white);

    // Deterministic from the payload, so the same session always draws the
    // same pattern instead of flickering on every rebuild.
    var seed = 0;
    for (final c in data.codeUnits) {
      seed = (seed * 31 + c) & 0x7fffffff;
    }
    final rnd = math.Random(seed);

    for (var y = 0; y < _modules; y++) {
      for (var x = 0; x < _modules; x++) {
        if (_isFinderZone(x, y)) continue;
        if (rnd.nextBool()) {
          canvas.drawRect(
            Rect.fromLTWH(quiet + x * m, quiet + y * m, m, m),
            dark,
          );
        }
      }
    }

    for (final (fx, fy) in [(0, 0), (_modules - 7, 0), (0, _modules - 7)]) {
      _finder(canvas, quiet + fx * m, quiet + fy * m, m, dark);
    }
  }

  bool _isFinderZone(int x, int y) {
    bool near(int ox, int oy) => x >= ox && x < ox + 8 && y >= oy && y < oy + 8;
    return near(0, 0) || near(_modules - 7, 0) || near(0, _modules - 7);
  }

  void _finder(Canvas canvas, double x, double y, double m, Paint dark) {
    canvas.drawRect(Rect.fromLTWH(x, y, m * 7, m * 7), dark);
    canvas.drawRect(
      Rect.fromLTWH(x + m, y + m, m * 5, m * 5),
      Paint()..color = Colors.white,
    );
    canvas.drawRect(Rect.fromLTWH(x + m * 2, y + m * 2, m * 3, m * 3), dark);
  }

  @override
  bool shouldRepaint(covariant _QrPainter old) => old.data != data;
}
