import 'dart:math' as math;
import 'dart:typed_data';

/// Turns a colour composite into the 1-bit rows a thermal head can burn.
///
/// None of this existed in the web app: its ESC/POS encoder
/// (web/src/lib/bluetooth-printer.ts) is text-only. Printing a photograph is
/// the new work, and the constraints are physical rather than aesthetic:
///
///   * The head can only heat a limited number of dots at once (commonly 64
///     of 384). A dense black image prints slowly, comes out grey, and can
///     trip thermal shutdown. So the pipeline lifts the image before
///     dithering to land near 35-45% black coverage.
///   * Output is one bit per dot. There is no grey, only the illusion of it,
///     which is what the error diffusion below buys.
class RasterPipeline {
  const RasterPipeline({
    this.gamma = 1.35,
    this.brightness = 1.12,
    this.serpentine = true,
    this.threshold = 128,
  });

  /// >1 lifts midtones away from black. The single most useful knob for
  /// keeping a photo printable; exposed so it can be tuned per printer.
  final double gamma;
  final double brightness;

  /// Alternating scan direction. Costs nothing and visibly reduces the
  /// diagonal worming that plain left-to-right diffusion leaves in skin tones.
  final bool serpentine;
  final int threshold;

  /// RGBA bytes -> packed 1-bit rows, MSB first, (width+7)>>3 bytes per row.
  ///
  /// Floyd-Steinberg is written out rather than taken from the `image`
  /// package: that one dithers to a colour palette, and feeding a 2-colour
  /// palette through a neural quantizer to get black and white is both slower
  /// and less predictable than the twelve lines it replaces.
  Uint8List rasterize({
    required Uint8List rgba,
    required int width,
    required int height,
  }) {
    // 1. Luminance, with the lift applied up front.
    final gray = Float32List(width * height);
    for (var i = 0, p = 0; i < gray.length; i++, p += 4) {
      final r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
      final a = rgba[p + 3] / 255.0;
      // Composite onto white: an unpainted pixel is unburned paper, not black.
      var lum = (0.299 * r + 0.587 * g + 0.114 * b) * a + 255 * (1 - a);
      lum = math.pow(lum / 255.0, 1 / gamma).toDouble() * 255.0 * brightness;
      gray[i] = lum.clamp(0.0, 255.0);
    }

    // 2. Floyd-Steinberg, serpentine.
    final rowBytes = (width + 7) >> 3;
    final out = Uint8List(rowBytes * height);
    for (var y = 0; y < height; y++) {
      final leftToRight = !serpentine || y.isEven;
      for (var k = 0; k < width; k++) {
        final x = leftToRight ? k : width - 1 - k;
        final i = y * width + x;
        final old = gray[i];
        final isBlack = old < threshold;
        final newVal = isBlack ? 0.0 : 255.0;
        final err = old - newVal;

        if (isBlack) {
          // 1 = burn. MSB is the leftmost dot of the byte.
          out[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
        }

        final fwd = leftToRight ? 1 : -1;
        void spread(int dx, int dy, double factor) {
          final nx = x + dx * fwd, ny = y + dy;
          if (nx < 0 || nx >= width || ny >= height) return;
          final j = ny * width + nx;
          gray[j] = (gray[j] + err * factor).clamp(0.0, 255.0);
        }

        spread(1, 0, 7 / 16);
        spread(-1, 1, 3 / 16);
        spread(0, 1, 5 / 16);
        spread(1, 1, 1 / 16);
      }
    }
    return out;
  }

  /// Fraction of dots that will be burned. The caller uses this to warn an
  /// operator before sending a job that will crawl and overheat.
  static double blackCoverage(Uint8List packed) {
    var bits = 0;
    for (final b in packed) {
      bits += _popcount(b);
    }
    return packed.isEmpty ? 0 : bits / (packed.length * 8);
  }

  static int _popcount(int b) {
    var n = b, c = 0;
    while (n != 0) {
      c += n & 1;
      n >>= 1;
    }
    return c;
  }
}
