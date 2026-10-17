import 'dart:async';

import 'printer.dart';

/// A printer that prints nothing, at a realistic speed.
///
/// The pacing matters: a thermal strip takes tens of seconds to come out, and
/// a progress screen that completes instantly would never reveal that the UI
/// has nothing to say during the wait. [failAfter] exercises the path that
/// matters most — paper running out on a customer who has already paid.
class FakePrinter implements BoothPrinter {
  FakePrinter({
    this.capabilities = PrinterCapabilities.thermal80,
    this.health = PrinterHealth.ready,
    this.duration = const Duration(seconds: 6),
    this.failAfter,
  });

  @override
  final PrinterCapabilities capabilities;

  final PrinterHealth health;
  final Duration duration;

  /// When set, the job dies at this fraction of the way through — the way a
  /// roll runs out mid-strip.
  final double? failAfter;

  @override
  Stream<PrintProgress> print(PrintJob job) async* {
    const steps = 24;
    final step = duration ~/ steps;
    for (var i = 1; i <= steps; i++) {
      await Future<void>.delayed(step);
      final f = i / steps;
      if (failAfter != null && f >= failAfter!) {
        throw StateError('Kertas habis');
      }
      yield PrintProgress(f, note: 'Mencetak ${(f * 100).round()}%');
    }
  }

  @override
  Future<PrinterStatus> probe() async {
    await Future<void>.delayed(const Duration(milliseconds: 180));
    return PrinterStatus(
      health,
      detail: health == PrinterHealth.ready ? '' : 'printer tidak siap',
    );
  }

  @override
  Future<void> disconnect() async {}
}
