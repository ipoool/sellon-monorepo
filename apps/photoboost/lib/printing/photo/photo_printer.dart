import 'dart:async';

import '../printer.dart';

/// Placeholder for the real photo printer (dye-sub, colour).
///
/// It exists now, unimplemented, so the seam is visible in the code rather
/// than merely remembered: the session flow already depends only on
/// BoothPrinter, so filling this in later is additive. Thermal ships first,
/// printing the photo onto receipt paper.
class PhotoPrinter implements BoothPrinter {
  @override
  PrinterCapabilities get capabilities => throw UnsupportedError(
    'Printer foto belum didukung — gunakan printer thermal.',
  );

  @override
  Stream<PrintProgress> print(PrintJob job) =>
      Stream.error(UnsupportedError('Printer foto belum didukung.'));

  @override
  Future<PrinterStatus> probe() async =>
      const PrinterStatus(PrinterHealth.offline, detail: 'belum didukung');

  @override
  Future<void> disconnect() async {}
}
