import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

/// Lays out the finished photo strip.
///
/// Renders TWICE from the same code: once at screen resolution for the
/// preview, once at the printer's dotsPerLine for the print. That is what
/// lets a photo printer be added later without redoing the layout — it just
/// reports a bigger width.
///
/// On a monochrome printer the caption is NOT drawn here. Rasterised type at
/// 203 dpi dithers into a solid black bar: ugly, and it burns a whole band of
/// dots for a few words. The thermal driver prints those lines as ESC/POS
/// text instead — sharper, and nearly free in heat. `monochrome: true` is
/// what asks for that.
class CompositeRenderer {
  const CompositeRenderer({
    this.gutter = 0.02,
    this.headerFraction = 0.07,
    this.footerFraction = 0.05,
  });

  /// All spacing is a FRACTION of width, never pixels: the same layout has to
  /// hold at 384 dots and at a photo printer's several thousand.
  final double gutter;
  final double headerFraction;
  final double footerFraction;

  /// Strip height for a given width and shot count. Drops the caption bands
  /// when the driver will print them as text.
  double heightFor(double width, int shots, {bool monochrome = false}) {
    final g = width * gutter;
    final cell = (width - g * 2) * 0.75; // 4:3 shots
    final chrome = monochrome
        ? g
        : width * headerFraction + width * footerFraction;
    return chrome + g + (cell + g) * shots;
  }

  /// Draws the strip. [shots] are decoded images in capture order.
  Future<ui.Image> render({
    required List<ui.Image> shots,
    required double width,
    required String boothName,
    required String sessionNumber,
    ui.Image? frame,
    bool monochrome = false,
  }) async {
    final height = heightFor(width, shots.length, monochrome: monochrome);
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder, Rect.fromLTWH(0, 0, width, height));

    // Paper. On a thermal printer this is literally unburned paper, so it
    // must be pure white — any tint would be dithered into stray dots.
    canvas.drawRect(
      Rect.fromLTWH(0, 0, width, height),
      Paint()..color = Colors.white,
    );

    final g = width * gutter;
    final cell = (width - g * 2) * 0.75;
    var y = monochrome ? g : width * headerFraction;

    if (!monochrome) _header(canvas, width, boothName);

    for (final shot in shots) {
      final dst = Rect.fromLTWH(g, y, width - g * 2, cell);
      _drawCover(canvas, shot, dst);
      if (frame != null) {
        canvas.drawImageRect(
          frame,
          Rect.fromLTWH(0, 0, frame.width.toDouble(), frame.height.toDouble()),
          dst,
          Paint(),
        );
      }
      y += cell + g;
    }

    if (!monochrome) _footer(canvas, width, height, sessionNumber);

    final picture = recorder.endRecording();
    return picture.toImage(width.toInt(), height.toInt());
  }

  void _header(Canvas canvas, double width, String boothName) {
    final tp = TextPainter(
      text: TextSpan(
        text: boothName.isEmpty ? 'PhotoBoost' : boothName,
        style: TextStyle(
          fontSize: width * 0.05,
          fontWeight: FontWeight.w700,
          color: Colors.black,
          letterSpacing: width * 0.001,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: width * 0.9);
    tp.paint(canvas, Offset((width - tp.width) / 2, width * 0.015));
  }

  void _footer(
    Canvas canvas,
    double width,
    double height,
    String sessionNumber,
  ) {
    final tp = TextPainter(
      text: TextSpan(
        text: sessionNumber,
        style: TextStyle(
          fontSize: width * 0.028,
          fontWeight: FontWeight.w600,
          color: Colors.black,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: width * 0.9);
    tp.paint(canvas, Offset((width - tp.width) / 2, height - width * 0.045));
  }

  /// Cover-fit: fills the cell and crops the overflow, so a 4:3 webcam frame
  /// never letterboxes into bands of solid white.
  void _drawCover(Canvas canvas, ui.Image img, Rect dst) {
    final iw = img.width.toDouble(), ih = img.height.toDouble();
    final scale = (dst.width / iw) > (dst.height / ih)
        ? dst.width / iw
        : dst.height / ih;
    final w = iw * scale, h = ih * scale;
    final src = Rect.fromLTWH(
      (w - dst.width) / 2 / scale,
      (h - dst.height) / 2 / scale,
      dst.width / scale,
      dst.height / scale,
    );
    canvas.save();
    canvas.clipRect(dst);
    canvas.drawImageRect(img, src, dst, Paint());
    canvas.restore();
  }

  /// RGBA bytes for the raster pipeline.
  static Future<Uint8List> toRgba(ui.Image img) async {
    final data = await img.toByteData(format: ui.ImageByteFormat.rawRgba);
    return data!.buffer.asUint8List();
  }
}

/// Decodes a captured shot from disk. Shots live as files rather than bytes
/// so a session survives the process being killed; this is the way back.
Future<ui.Image> decodeImageFile(File file) async {
  final bytes = await file.readAsBytes();
  final codec = await ui.instantiateImageCodec(bytes);
  final frame = await codec.getNextFrame();
  return frame.image;
}
