import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:photoboost/printing/thermal/escpos_commands.dart';
import 'package:photoboost/printing/thermal/raster_pipeline.dart';

/// Builds RGBA for a solid colour.
Uint8List solid(int w, int h, int r, int g, int b, [int a = 255]) {
  final out = Uint8List(w * h * 4);
  for (var i = 0; i < w * h; i++) {
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = a;
  }
  return out;
}

void main() {
  const pipeline = RasterPipeline();

  group('raster packing', () {
    test('produces (width+7)>>3 bytes per row', () {
      for (final w in [1, 8, 9, 384, 576]) {
        final packed = pipeline.rasterize(
          rgba: solid(w, 3, 255, 255, 255),
          width: w,
          height: 3,
        );
        expect(
          packed.length,
          ((w + 7) >> 3) * 3,
          reason: 'width $w must pack to whole bytes per row',
        );
      }
    });

    test('white paper burns no dots', () {
      final packed = pipeline.rasterize(
        rgba: solid(64, 8, 255, 255, 255),
        width: 64,
        height: 8,
      );
      expect(
        packed.every((b) => b == 0),
        isTrue,
        reason: 'white must leave the paper unburned',
      );
    });

    test('black burns every dot', () {
      final packed = pipeline.rasterize(
        rgba: solid(64, 8, 0, 0, 0),
        width: 64,
        height: 8,
      );
      expect(packed.every((b) => b == 0xFF), isTrue);
    });

    test('transparent pixels composite onto white, not black', () {
      // A frame overlay is mostly transparent. Treating alpha=0 as black
      // would burn the whole sheet solid and jam the printer.
      final packed = pipeline.rasterize(
        rgba: solid(64, 8, 0, 0, 0, 0),
        width: 64,
        height: 8,
      );
      expect(
        packed.every((b) => b == 0),
        isTrue,
        reason: 'fully transparent must read as paper',
      );
    });
  });

  group('dithering', () {
    test('mid grey lands near half coverage, not all-or-nothing', () {
      // The whole point of error diffusion: a flat grey must become a mix of
      // dots. A plain threshold would make it uniformly black or white.
      final packed = pipeline.rasterize(
        rgba: solid(128, 64, 128, 128, 128),
        width: 128,
        height: 64,
      );
      final cov = RasterPipeline.blackCoverage(packed);
      expect(cov, greaterThan(0.05));
      expect(cov, lessThan(0.95));
    });

    test('gamma lift keeps a dark photo inside the printable band', () {
      // Thermal heads can only heat a fraction of their dots at once, so a
      // dense image prints grey and slow. The lift exists to keep real
      // photographs under control; verify it actually moves the needle.
      final dark = solid(128, 64, 70, 70, 70);
      final lifted = const RasterPipeline(
        gamma: 1.6,
        brightness: 1.2,
      ).rasterize(rgba: dark, width: 128, height: 64);
      final flat = const RasterPipeline(
        gamma: 1.0,
        brightness: 1.0,
      ).rasterize(rgba: dark, width: 128, height: 64);
      expect(
        RasterPipeline.blackCoverage(lifted),
        lessThan(RasterPipeline.blackCoverage(flat)),
        reason: 'lifting must reduce burn, otherwise it is doing nothing',
      );
    });

    test('is deterministic', () {
      // Golden-test safety: the same input must raster identically, or the
      // output can never be pinned.
      final rgba = solid(64, 32, 90, 140, 200);
      final a = pipeline.rasterize(rgba: rgba, width: 64, height: 32);
      final b = pipeline.rasterize(rgba: rgba, width: 64, height: 32);
      expect(a, equals(b));
    });
  });

  group('escpos', () {
    test('GS v 0 header carries row bytes and height little-endian', () {
      final e = EscPos(384);
      final rows = Uint8List(48 * 2); // 384 dots wide, 2 rows
      e.imageRaster(rows, widthDots: 384, heightDots: 2);
      final out = e.bytes();

      expect(out.sublist(0, 4), equals([0x1d, 0x76, 0x30, 0x00]));
      expect(out[4], 48, reason: 'xL = (384+7)>>3');
      expect(out[5], 0, reason: 'xH');
      expect(out[6], 2, reason: 'yL');
      expect(out[7], 0, reason: 'yH');
      expect(out.length, 8 + rows.length);
    });

    test('tall bands encode height across both bytes', () {
      final e = EscPos(576);
      e.imageRaster(Uint8List(72 * 300), widthDots: 576, heightDots: 300);
      final out = e.bytes();
      expect(out[6], 300 & 0xff);
      expect(out[7], (300 >> 8) & 0xff);
    });

    test('columns follow paper width', () {
      expect(EscPos(384).columns, 32);
      expect(EscPos(576).columns, 48);
    });

    test('non-latin1 text degrades to ? instead of a wrong glyph', () {
      final e = EscPos(384)..text('Foto — selesai ✓');
      final out = e.bytes();
      expect(out.contains(0x3f), isTrue);
      // No byte above 0xff can exist in a Uint8List, but the point is that
      // the multi-byte runes were replaced rather than truncated.
      expect(out.length, lessThanOrEqualTo('Foto — selesai ✓'.length + 1));
    });

    test('test slip is self-contained: init through cut', () {
      final b = EscPos.testSlip(384);
      expect(
        b.sublist(0, 2),
        equals([0x1b, 0x40]),
        reason: 'starts with ESC @',
      );
      expect(
        b.sublist(b.length - 3),
        equals([0x1d, 0x56, 0x00]),
        reason: 'ends with a cut',
      );
    });
  });
}
