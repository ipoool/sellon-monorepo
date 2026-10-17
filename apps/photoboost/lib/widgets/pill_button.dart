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

    return Semantics(
      button: true,
      enabled: enabled,
      label: label,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(SellonRadii.pill),
          child: Ink(
            decoration: BoxDecoration(
              color: bg,
              borderRadius: BorderRadius.circular(SellonRadii.pill),
              border: border == null
                  ? null
                  : Border.all(color: border, width: 1.5),
              // The one thing to press is the brightest thing on screen.
              boxShadow: variant == PillVariant.primary && enabled
                  ? BoothSurface.accentGlow(0.8)
                  : null,
            ),
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
