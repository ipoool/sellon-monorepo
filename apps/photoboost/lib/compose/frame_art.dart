import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Decorative borders drawn onto the strip.
///
/// Painted rather than loaded as images, for two reasons that both matter:
///
///   * They scale. The same frame has to look right at 576 printer dots and
///     at 1080px for the soft copy; a bitmap would be soft at one of them.
///   * They stay printable. A thermal head can only heat a fraction of its
///     dots at once, so solid fills print grey, print slowly, and can trip
///     the thermal cutout. Everything here is line art and small marks, which
///     is the shape of decoration receipt paper can actually carry.
///
/// Admin-uploaded frames will eventually arrive as images; this keeps the
/// chooser honest in the meantime, because a frame the customer picks must
/// visibly change what they are about to get.
enum FrameStyle {
  polos('polos', 'Polos'),
  pita('pita', 'Pita'),
  bintang('bintang', 'Bintang'),
  hati('hati', 'Hati');

  const FrameStyle(this.id, this.label);
  final String id;
  final String label;

  static FrameStyle fromId(String? id) => FrameStyle.values.firstWhere(
    (f) => f.id == id,
    orElse: () => FrameStyle.polos,
  );

  /// Draws the frame over one photo cell. [unit] is the strip width, so every
  /// measurement scales with the output rather than being pinned to pixels.
  void paintCell(Canvas canvas, Rect cell, double unit) {
    final ink = Paint()
      ..color = Colors.black
      ..style = PaintingStyle.stroke
      ..strokeWidth = unit * 0.006
      ..strokeCap = StrokeCap.round;

    switch (this) {
      case FrameStyle.polos:
        // A hairline keeps the photo from bleeding into the paper edge.
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            cell.deflate(unit * 0.008),
            Radius.circular(unit * 0.012),
          ),
          ink,
        );

      case FrameStyle.pita:
        // A ribbon: double rule with a bow mark at each top corner.
        final outer = cell.deflate(unit * 0.008);
        canvas.drawRect(outer, ink);
        canvas.drawRect(outer.deflate(unit * 0.012), ink);
        _bow(canvas, Offset(outer.left + unit * 0.05, outer.top), unit, ink);
        _bow(canvas, Offset(outer.right - unit * 0.05, outer.top), unit, ink);

      case FrameStyle.bintang:
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            cell.deflate(unit * 0.01),
            Radius.circular(unit * 0.02),
          ),
          ink,
        );
        final fill = Paint()..color = Colors.black;
        for (final (dx, dy, scale) in const [
          (0.06, 0.08, 1.0),
          (0.92, 0.14, 0.7),
          (0.12, 0.86, 0.65),
          (0.88, 0.80, 0.9),
        ]) {
          _star(
            canvas,
            Offset(cell.left + cell.width * dx, cell.top + cell.height * dy),
            unit * 0.022 * scale,
            fill,
          );
        }

      case FrameStyle.hati:
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            cell.deflate(unit * 0.01),
            Radius.circular(unit * 0.03),
          ),
          ink,
        );
        final fill = Paint()..color = Colors.black;
        for (final (dx, dy, scale) in const [
          (0.08, 0.12, 1.0),
          (0.90, 0.10, 0.75),
          (0.90, 0.88, 1.0),
        ]) {
          _heart(
            canvas,
            Offset(cell.left + cell.width * dx, cell.top + cell.height * dy),
            unit * 0.020 * scale,
            fill,
          );
        }
    }
  }

  void _bow(Canvas canvas, Offset c, double unit, Paint ink) {
    final r = unit * 0.016;
    canvas.drawOval(
      Rect.fromCenter(
        center: c.translate(-r, 0),
        width: r * 1.8,
        height: r * 1.3,
      ),
      ink,
    );
    canvas.drawOval(
      Rect.fromCenter(
        center: c.translate(r, 0),
        width: r * 1.8,
        height: r * 1.3,
      ),
      ink,
    );
  }

  void _star(Canvas canvas, Offset c, double r, Paint fill) {
    final path = Path();
    for (var i = 0; i < 10; i++) {
      final rad = i.isEven ? r : r * 0.44;
      final a = -math.pi / 2 + i * math.pi / 5;
      final p = Offset(c.dx + rad * math.cos(a), c.dy + rad * math.sin(a));
      i == 0 ? path.moveTo(p.dx, p.dy) : path.lineTo(p.dx, p.dy);
    }
    canvas.drawPath(path..close(), fill);
  }

  void _heart(Canvas canvas, Offset c, double r, Paint fill) {
    final path = Path()
      ..moveTo(c.dx, c.dy + r * 0.85)
      ..cubicTo(
        c.dx - r * 1.6,
        c.dy - r * 0.2,
        c.dx - r * 0.55,
        c.dy - r * 1.25,
        c.dx,
        c.dy - r * 0.35,
      )
      ..cubicTo(
        c.dx + r * 0.55,
        c.dy - r * 1.25,
        c.dx + r * 1.6,
        c.dy - r * 0.2,
        c.dx,
        c.dy + r * 0.85,
      );
    canvas.drawPath(path..close(), fill);
  }
}
