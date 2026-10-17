import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// The idle strip is the booth's shop window, and it ships inside the APK.
/// If an asset is renamed or dropped from pubspec, the strip silently turns
/// into four grey boxes in a mall — these assert the bytes are really there.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('every sample photo is bundled and is a real JPEG', () async {
    for (var i = 1; i <= 4; i++) {
      final data = await rootBundle.load('assets/samples/$i.jpg');
      expect(
        data.lengthInBytes,
        greaterThan(5000),
        reason: 'assets/samples/$i.jpg is missing or truncated',
      );
      // JPEG magic: FF D8 FF.
      expect(data.getUint8(0), 0xFF);
      expect(data.getUint8(1), 0xD8);
      expect(data.getUint8(2), 0xFF);
    }
  });

  test('the bundle stays small enough to ship', () async {
    var total = 0;
    for (var i = 1; i <= 4; i++) {
      total += (await rootBundle.load('assets/samples/$i.jpg')).lengthInBytes;
    }
    // A booth tablet is provisioned over someone's phone hotspot more often
    // than anyone plans for. 1 MB of decoration is already generous.
    expect(total, lessThan(1024 * 1024), reason: 'samples total ${total}B');
  });
}
