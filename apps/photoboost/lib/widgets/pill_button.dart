import 'package:flutter/material.dart';

import '../theme/booth_surface.dart';
import '../theme/shadows.dart';
import '../theme/typography.dart';

enum PillVariant { primary, secondary, ghost }

/// The one button shape in the app. Fully rounded, like every button in the
/// redesigned web theme.
///
/// Minimum height is 64 rather than the web's 44: this is a touch target for
/// someone standing at arm's length, often in a hurry, sometimes with a
/// phone in the other hand.
class PillButton extends StatelessWidget {
  const PillButton({
    super.key,
    required this.label,
    this.onPressed,
    this.variant = PillVariant.primary,
    this.icon,
    this.minWidth = 0,
  });

  final String label;
  final VoidCallback? onPressed;
  final PillVariant variant;
  final IconData? icon;
  final double minWidth;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    final (bg, fg, border) = switch (variant) {
      PillVariant.primary => (
        enabled ? BoothSurface.accentStrong : BoothSurface.border,
        enabled ? Colors.white : BoothSurface.textMuted,
        null,
      ),
      PillVariant.secondary => (
        BoothSurface.card,
        BoothSurface.accent,
        BoothSurface.border,
      ),
      PillVariant.ghost => (
        Colors.transparent,
        BoothSurface.textSecondary,
        BoothSurface.border,
      ),
    };

    final radius = BorderRadius.circular(SellonRadii.pill);
    final glow = variant == PillVariant.primary && enabled
        ? BoothSurface.accentGlow(0.8)
        : null;

    return Semantics(
      button: true,
      enabled: enabled,
      label: label,
      // The glow sits on a plain DecoratedBox OUTSIDE the Material, not on an
      // Ink decoration inside it. Ink paints into the Material's own layer,
      // where a boxShadow is not clipped to the pill — under Impeller that
      // surfaced as a hard-edged rectangle sitting behind every primary
      // button. Skia hid it, so it only showed up on the tablet.
      child: DecoratedBox(
        decoration: BoxDecoration(borderRadius: radius, boxShadow: glow),
        child: Material(
          color: bg,
          // Shape plus clipBehavior is what keeps the ripple inside the pill
          // now that the fill lives on the Material rather than on an Ink.
          shape: StadiumBorder(
            side: border == null
                ? BorderSide.none
                : BorderSide(color: border, width: 1.5),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onPressed,
            child: Container(
              constraints: BoxConstraints(minHeight: 64, minWidth: minWidth),
              padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (icon != null) ...[
                    Icon(icon, color: fg, size: 24),
                    const SizedBox(width: 12),
                  ],
                  Text(label, style: SellonText.button.copyWith(color: fg)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
