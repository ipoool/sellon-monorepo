import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Fades and lifts a child into place, staggered by [delay].
///
/// Used to make the idle screen assemble itself rather than appear fully
/// formed: a booth that moves reads as awake, and a passer-by glances at
/// movement before they read a headline.
class FadeInUp extends StatefulWidget {
  const FadeInUp({
    super.key,
    required this.child,
    this.delay = Duration.zero,
    this.offset = 28,
    this.duration = const Duration(milliseconds: 620),
  });

  final Widget child;
  final Duration delay;
  final double offset;
  final Duration duration;

  @override
  State<FadeInUp> createState() => _FadeInUpState();
}

class _FadeInUpState extends State<FadeInUp>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: widget.duration,
  );
  late final Animation<double> _curve = CurvedAnimation(
    parent: _c,
    curve: Curves.easeOutCubic,
  );

  @override
  void initState() {
    super.initState();
    Future<void>.delayed(widget.delay, () {
      if (mounted) _c.forward();
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _curve,
    builder: (_, child) => Opacity(
      opacity: _curve.value,
      child: Transform.translate(
        offset: Offset(0, widget.offset * (1 - _curve.value)),
        child: child,
      ),
    ),
    child: widget.child,
  );
}

/// A slow breathing scale. Deliberately subtle — this runs for hours in a
/// mall, and anything livelier becomes irritating by the third time you walk
/// past it.
class Breathe extends StatefulWidget {
  const Breathe({
    super.key,
    required this.child,
    this.amount = 0.03,
    this.period = const Duration(milliseconds: 2600),
    this.delay = Duration.zero,
  });

  final Widget child;
  final double amount;
  final Duration period;
  final Duration delay;

  @override
  State<Breathe> createState() => _BreatheState();
}

class _BreatheState extends State<Breathe> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: widget.period,
  );

  @override
  void initState() {
    super.initState();
    Future<void>.delayed(widget.delay, () {
      if (mounted) _c.repeat(reverse: true);
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _c,
    builder: (_, child) => Transform.scale(
      scale: 1 + widget.amount * Curves.easeInOut.transform(_c.value),
      child: child,
    ),
    child: widget.child,
  );
}

/// Walks a highlight along a row of steps, one at a time, so the four icons
/// read as a sequence rather than a static row of buttons.
class StepPulse extends StatefulWidget {
  const StepPulse({
    super.key,
    required this.count,
    required this.builder,
    this.dwell = const Duration(milliseconds: 1100),
  });

  final int count;
  final Duration dwell;

  /// Called with the index and how lit that step currently is, 0..1.
  final Widget Function(BuildContext context, int index, double t) builder;

  @override
  State<StepPulse> createState() => _StepPulseState();
}

class _StepPulseState extends State<StepPulse>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: widget.dwell * widget.count,
  )..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _c,
    builder: (context, _) {
      final pos = _c.value * widget.count;
      return Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          for (var i = 0; i < widget.count; i++)
            widget.builder(context, i, _lit(pos, i)),
        ],
      );
    },
  );

  /// Triangular falloff around the travelling head, wrapping at the ends so
  /// the loop has no visible seam.
  double _lit(double pos, int i) {
    var d = (pos - i).abs();
    final wrapped = widget.count - d;
    if (wrapped < d) d = wrapped;
    return (1 - d).clamp(0.0, 1.0);
  }
}

/// Soft blobs drifting behind the content. Gives the idle screen depth
/// without a video file or any asset to ship.
class DriftingBlobs extends StatefulWidget {
  const DriftingBlobs({super.key, required this.colors});

  final List<Color> colors;

  @override
  State<DriftingBlobs> createState() => _DriftingBlobsState();
}

class _DriftingBlobsState extends State<DriftingBlobs>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 22),
  )..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _c,
    builder: (_, _) => CustomPaint(
      painter: _BlobPainter(_c.value, widget.colors),
      size: Size.infinite,
    ),
  );
}

class _BlobPainter extends CustomPainter {
  _BlobPainter(this.t, this.colors);
  final double t;
  final List<Color> colors;

  @override
  void paint(Canvas canvas, Size size) {
    for (var i = 0; i < colors.length; i++) {
      final phase = t * 2 * math.pi + i * 2.1;
      final cx = size.width * (0.2 + 0.6 * (0.5 + 0.5 * math.sin(phase)));
      final cy =
          size.height * (0.25 + 0.5 * (0.5 + 0.5 * math.cos(phase * 0.8)));
      final r = size.shortestSide * (0.38 + 0.08 * math.sin(phase * 1.3));
      canvas.drawCircle(
        Offset(cx, cy),
        r,
        Paint()
          ..color = colors[i]
          ..maskFilter = MaskFilter.blur(BlurStyle.normal, r * 0.6),
      );
    }
  }

  @override
  bool shouldRepaint(covariant _BlobPainter old) => old.t != t;
}
