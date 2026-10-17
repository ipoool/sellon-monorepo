import 'package:flutter/material.dart';

import '../theme/booth_surface.dart';
import '../theme/colors.dart';
import '../theme/shadows.dart';

/// A pale wash with the faint dot pattern the web theme uses on its feature
/// panels (.bg-soft-dots). The dots are painted, not an image asset, so they
/// stay crisp at any tablet density.
class TintedPanel extends StatelessWidget {
  const TintedPanel({
    super.key,
    required this.child,
    this.tint = BoothSurface.card,
    this.radius = SellonRadii.panel,
    this.padding = const EdgeInsets.all(32),
    this.pattern = true,
  });

  final Widget child;
  final Color tint;
  final double radius;
  final EdgeInsets padding;
  final bool pattern;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: Container(
        decoration: BoxDecoration(
          color: tint,
          border: Border.all(color: BoothSurface.border),
          borderRadius: BorderRadius.circular(radius),
        ),
        child: CustomPaint(
          painter: pattern ? _DotPainter() : null,
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }
}

class _DotPainter extends CustomPainter {
  static const _spacing = 22.0;
  static const _radius = 1.5;

  @override
  void paint(Canvas canvas, Size size) {
    // Light dots on a dark panel; the web theme's dark-on-light would
    // vanish entirely here.
    final paint = Paint()..color = const Color(0x14FFFFFF);
    for (var y = 1.0; y < size.height; y += _spacing) {
      for (var x = 1.0; x < size.width; x += _spacing) {
        canvas.drawCircle(Offset(x, y), _radius, paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Solid-fill rounded square with a white glyph — the icon chip from the web
/// components, scaled up for a tablet.
class IconChip extends StatelessWidget {
  const IconChip({
    super.key,
    required this.icon,
    this.fill = SellonColors.brand500,
    this.size = 72,
  });

  final IconData icon;
  final Color fill;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      color: fill,
      borderRadius: BorderRadius.circular(size * 0.36),
    ),
    child: Icon(icon, color: Colors.white, size: size * 0.5),
  );
}
