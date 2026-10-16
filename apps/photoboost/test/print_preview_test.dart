@Tags(['preview'])
library;

import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:photoboost/compose/composite_renderer.dart';
import 'package:photoboost/printing/thermal/raster_pipeline.dart';

/// Not an assertion test: this renders what the thermal printer will actually
/// put on paper, at both paper widths, and writes it to build/print-preview/.
///
/// It exists so the 58mm-vs-80mm decision can be made by looking at a real
/// dithered strip instead of guessing from a mockup — before any hardware is
/// bought. Run it with:
///
///   flutter test test/print_preview_test.dart
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('render strip previews at 58mm and 80mm', () async {
    final shots = <ui.Image>[];
    for (var i = 1; i <= 4; i++) {
      shots.add(await _fakePhoto(i));
    }

    final out = Directory('build/print-preview')..createSync(recursive: true);
    const renderer = CompositeRenderer();
    const pipeline = RasterPipeline();

    for (final spec in [(384, '58mm'), (576, '80mm')]) {
      final dots = spec.$1.toDouble();
      final label = spec.$2;

      final composite = await renderer.render(
        shots: shots,
        width: dots,
        boothName: 'PhotoBoost',
        sessionNumber: 'PB-JKT01-261016-BTUU7R',
        // The thermal driver prints the caption as text, so it is excluded
        // from the raster. Including it burns a solid black bar.
        monochrome: true,
      );
      final rgba = await CompositeRenderer.toRgba(composite);

      // Colour composite, as the screen preview shows it.
      final colourPng = await composite.toByteData(
        format: ui.ImageByteFormat.png,
      );
      File(
        '${out.path}/strip-$label-colour.png',
      ).writeAsBytesSync(colourPng!.buffer.asUint8List());

      // What the printer actually burns.
      final packed = pipeline.rasterize(
        rgba: rgba,
        width: composite.width,
        height: composite.height,
      );
      final coverage = RasterPipeline.blackCoverage(packed);
      final mono = await _unpackToPng(
        packed,
        composite.width,
        composite.height,
      );
      File('${out.path}/strip-$label-thermal.png').writeAsBytesSync(mono);

      // ignore: avoid_print
      print(
        '$label: ${composite.width}x${composite.height} dots, '
        'black coverage ${(coverage * 100).toStringAsFixed(1)}%, '
        '${(composite.height / 203 * 25.4).toStringAsFixed(0)}mm of paper',
      );

      // A strip that is more than ~55% black prints slowly, comes out grey,
      // and can trip the head's thermal cutout.
      expect(
        coverage,
        lessThan(0.55),
        reason: 'too dark to print cleanly at $label',
      );
    }
  });
}

/// Stand-in for a webcam frame: a photo-like gradient with shapes, so the
/// dithering has real midtones to work with rather than flat fills.
Future<ui.Image> _fakePhoto(int n) async {
  const w = 960.0, h = 720.0;
  final rec = ui.PictureRecorder();
  final canvas = Canvas(rec, const Rect.fromLTWH(0, 0, w, h));

  canvas.drawRect(
    const Rect.fromLTWH(0, 0, w, h),
    Paint()
      ..shader = ui.Gradient.linear(const Offset(0, 0), const Offset(w, h), [
        HSVColor.fromAHSV(1, (n * 57) % 360, 0.35, 0.95).toColor(),
        HSVColor.fromAHSV(1, (n * 57 + 40) % 360, 0.55, 0.55).toColor(),
      ]),
  );
  // A face-ish subject: soft midtones are where dithering either works or
  // turns to mud.
  canvas.drawCircle(
    const Offset(w / 2, h / 2 - 40),
    150,
    Paint()..color = const Color(0xFFE8C9A8),
  );
  canvas.drawCircle(
    const Offset(w / 2 - 55, h / 2 - 70),
    18,
    Paint()..color = const Color(0xFF3A2A20),
  );
  canvas.drawCircle(
    const Offset(w / 2 + 55, h / 2 - 70),
    18,
    Paint()..color = const Color(0xFF3A2A20),
  );
  canvas.drawRRect(
    RRect.fromRectAndRadius(
      Rect.fromCenter(
        center: const Offset(w / 2, h / 2 + 30),
        width: 90,
        height: 24,
      ),
      const Radius.circular(12),
    ),
    Paint()..color = const Color(0xFF8A4A3A),
  );
  canvas.drawRect(
    Rect.fromLTWH(0, h - 140, w, 140),
    Paint()..color = const Color(0x33000000),
  );

  return rec.endRecording().toImage(w.toInt(), h.toInt());
}

/// Expands packed 1-bit rows back into a viewable PNG, so the preview shows
/// exactly the dots the printer receives — not a greyscale approximation.
Future<Uint8List> _unpackToPng(Uint8List packed, int width, int height) async {
  final rowBytes = (width + 7) >> 3;
  final rgba = Uint8List(width * height * 4);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      final bit = (packed[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
      final v = bit == 1 ? 0 : 255;
      final i = (y * width + x) * 4;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
      rgba[i + 3] = 255;
    }
  }
  final completer = Completer<ui.Image>();
  ui.decodeImageFromPixels(
    rgba,
    width,
    height,
    ui.PixelFormat.rgba8888,
    completer.complete,
  );
  final img = await completer.future;
  final png = await img.toByteData(format: ui.ImageByteFormat.png);
  return png!.buffer.asUint8List();
}
