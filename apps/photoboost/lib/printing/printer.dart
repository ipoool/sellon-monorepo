import 'dart:ui' as ui;

/// What a printer can do. The flow reads this instead of assuming thermal:
/// a photo printer added later reports different numbers and the same layout
/// code renders at its resolution.
class PrinterCapabilities {
  const PrinterCapabilities({
    required this.dotsPerLine,
    required this.dpi,
    required this.isColor,
    required this.maxHeightDots,
    required this.paperMm,
  });

  /// 384 at 58mm, 576 at 80mm, far more on a dye-sub photo printer.
  final int dotsPerLine;
  final int dpi;
  final bool isColor;

  /// A hard cap on one job. Thermal heads overheat on long, dark prints.
  final int maxHeightDots;
  final int paperMm;

  static const thermal58 = PrinterCapabilities(
    dotsPerLine: 384,
    dpi: 203,
    isColor: false,
    maxHeightDots: 2400,
    paperMm: 58,
  );
  static const thermal80 = PrinterCapabilities(
    dotsPerLine: 576,
    dpi: 203,
    isColor: false,
    maxHeightDots: 2400,
    paperMm: 80,
  );
}

class PrintProgress {
  const PrintProgress(this.fraction, {this.note});
  final double fraction; // 0..1
  final String? note;
}

enum PrinterHealth { ready, offline, outOfPaper, overheated, unknown }

class PrinterStatus {
  const PrinterStatus(this.health, {this.detail = ''});
  final PrinterHealth health;
  final String detail;

  bool get canPrint => health == PrinterHealth.ready;
}

/// One job. Carries the composite as a ui.Image plus the metadata a caption
/// needs — NOT a pre-rasterised bitmap.
///
/// That distinction is the whole reason a photo printer can be added later
/// without touching the session flow: rasterising, dithering and bit-packing
/// are thermal concerns and stay inside the thermal implementation.
class PrintJob {
  const PrintJob({
    required this.image,
    required this.copies,
    required this.sessionNumber,
    required this.boothName,
    required this.takenAt,
  });

  final ui.Image image;
  final int copies;
  final String sessionNumber;
  final String boothName;
  final DateTime takenAt;
}

/// The booth's printer, whatever it physically is.
abstract class BoothPrinter {
  PrinterCapabilities get capabilities;

  /// Emits progress as the job goes out. A long thermal print takes tens of
  /// seconds, and a customer watching a frozen screen assumes it broke.
  Stream<PrintProgress> print(PrintJob job);

  Future<PrinterStatus> probe();

  Future<void> disconnect();
}
