import 'dart:ui' as ui;

/// Colour treatments a customer can pick.
///
/// Implemented as 4x5 colour matrices so one definition drives the live
/// preview, the printed strip and the soft copy — a filter that looked one
/// way on screen and another on paper would be worse than none.
///
/// Honest caveat for the thermal printer: it burns one bit per dot, so on
/// receipt paper these differ only in how the dithering falls. They are a
/// real feature of the digital copy and a subtle one on the print.
enum PhotoFilter {
  normal('Normal'),
  polaroid('Polaroid'),
  sepia('Sepia'),
  grayscale('Grayscale'),
  vintage('Vintage');

  const PhotoFilter(this.label);
  final String label;

  /// Null for [normal] — no filter is cheaper than an identity matrix.
  ui.ColorFilter? get colorFilter => switch (this) {
    PhotoFilter.normal => null,
    _ => ui.ColorFilter.matrix(_matrix),
  };

  List<double> get _matrix => switch (this) {
    // Never read: normal short-circuits above. Identity for safety.
    PhotoFilter.normal => const [
      1, 0, 0, 0, 0, //
      0, 1, 0, 0, 0, //
      0, 0, 1, 0, 0, //
      0, 0, 0, 1, 0,
    ],

    // Lifted blacks, cooler shadows, slightly blown highlights — the
    // instant-film look.
    PhotoFilter.polaroid => const [
      1.08, 0.00, 0.00, 0, 10, //
      0.00, 1.04, 0.04, 0, 12, //
      0.02, 0.04, 1.00, 0, 18, //
      0, 0, 0, 1, 0,
    ],

    PhotoFilter.sepia => const [
      0.393, 0.769, 0.189, 0, 0, //
      0.349, 0.686, 0.168, 0, 0, //
      0.272, 0.534, 0.131, 0, 0, //
      0, 0, 0, 1, 0,
    ],

    // Luminance weights, not a flat average: a flat average turns reds
    // to mud and is the classic giveaway of a careless greyscale.
    PhotoFilter.grayscale => const [
      0.2126, 0.7152, 0.0722, 0, 0, //
      0.2126, 0.7152, 0.0722, 0, 0, //
      0.2126, 0.7152, 0.0722, 0, 0, //
      0, 0, 0, 1, 0,
    ],

    // Warm, faded, slightly crushed — a scan of an old print.
    PhotoFilter.vintage => const [
      0.90, 0.30, 0.10, 0, 12, //
      0.20, 0.85, 0.10, 0, 6, //
      0.15, 0.20, 0.70, 0, 4, //
      0, 0, 0, 1, 0,
    ],
  };

  static PhotoFilter fromId(String? id) => PhotoFilter.values.firstWhere(
    (f) => f.name == id,
    orElse: () => PhotoFilter.normal,
  );
}
