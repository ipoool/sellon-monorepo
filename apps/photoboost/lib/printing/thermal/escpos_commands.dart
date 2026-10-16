import 'dart:convert';
import 'dart:typed_data';

/// ESC/POS command builder.
///
/// The text commands are ported from web/src/lib/bluetooth-printer.ts, which
/// has been printing real receipts in the POS for a while — same opcodes,
/// same 32/48-character line widths. What is new here is `imageRaster`
/// (GS v 0): the web encoder has no bitmap support at all, and printing a
/// photograph is the entire point of this app.
class EscPos {
  EscPos(this.dotsPerLine);

  final int dotsPerLine;
  final _buf = BytesBuilder();

  /// Characters per line: 32 at 58mm, 48 at 80mm.
  int get columns => dotsPerLine >= 576 ? 48 : 32;

  Uint8List bytes() => _buf.toBytes();

  EscPos init() => _raw([0x1b, 0x40]); // ESC @

  EscPos align(int n) => _raw([0x1b, 0x61, n]); // 0 left, 1 centre, 2 right

  EscPos bold(bool on) => _raw([0x1b, 0x45, on ? 1 : 0]); // ESC E

  EscPos doubleSize(bool on) => _raw([0x1d, 0x21, on ? 0x11 : 0x00]); // GS !

  EscPos feed(int lines) => _raw([0x1b, 0x64, lines]); // ESC d

  EscPos cut() => _raw([0x1d, 0x56, 0x00]); // GS V 0

  /// Latin-1 only, matching the web encoder: anything above 0xFF becomes '?'
  /// rather than silently printing a wrong glyph from whatever codepage the
  /// printer happens to be in.
  EscPos text(String s) {
    final out = <int>[];
    for (final r in s.runes) {
      out.add(r > 0xff ? 0x3f : r);
    }
    _buf.add(Uint8List.fromList(out));
    return _raw([0x0a]);
  }

  /// One band of a raster image: GS v 0 m xL xH yL yH + packed rows.
  ///
  /// Sent in bands rather than as one tall image on purpose. A full strip can
  /// be thousands of rows; handed over at once it overruns the printer's
  /// buffer on cheap units, and it gives the UI nothing to show a progress
  /// bar with.
  EscPos imageRaster(
    Uint8List packedRows, {
    required int widthDots,
    required int heightDots,
  }) {
    final rowBytes = (widthDots + 7) >> 3;
    _raw([
      0x1d, 0x76, 0x30, 0x00, // GS v 0, mode 0 (normal)
      rowBytes & 0xff, (rowBytes >> 8) & 0xff,
      heightDots & 0xff, (heightDots >> 8) & 0xff,
    ]);
    _buf.add(packedRows);
    return this;
  }

  /// A centred caption, printed as TEXT rather than burned into the raster:
  /// sharper, and it costs almost no heat.
  EscPos caption(String s) {
    align(1);
    text(_fit(s));
    align(0);
    return this;
  }

  String _fit(String s) => s.length <= columns ? s : s.substring(0, columns);

  EscPos _raw(List<int> b) {
    _buf.add(Uint8List.fromList(b));
    return this;
  }

  /// Test slip, the thermal equivalent of "does this thing work".
  static Uint8List testSlip(int dotsPerLine) {
    final e = EscPos(dotsPerLine)
      ..init()
      ..align(1)
      ..doubleSize(true)
      ..bold(true)
      ..text('PhotoBoost')
      ..doubleSize(false)
      ..bold(false)
      ..text('Tes cetak berhasil')
      ..text('$dotsPerLine dot / ${dotsPerLine >= 576 ? 80 : 58} mm')
      ..feed(3)
      ..cut();
    return e.bytes();
  }

  static Uint8List encodeLatin1(String s) => Uint8List.fromList(
    latin1.encode(s.replaceAll(RegExp(r'[^\x00-\xff]'), '?')),
  );
}
