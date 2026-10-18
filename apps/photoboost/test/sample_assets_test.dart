import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// The idle strip is the booth's shop window, and it ships inside the APK.
/// If an asset is renamed or dropped from pubspec, the strip silently turns
/// into four grey boxes in a mall — these assert the bytes are really there.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('every sample photo is bundled and is a real JPEG', () async {
    for (var i = 1; i <= 9; i++) {
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

  // The fan shows three strips of three. With fewer photographs than that,
  // the same faces repeat across the pile and it reads as one print copied
  // three times — the opposite of "look how many people used this".
  test('there are enough photographs for every cell in the fan', () async {
    var found = 0;
    for (var i = 1; i <= 20; i++) {
      try {
        await rootBundle.load('assets/samples/$i.jpg');
        found++;
      } catch (_) {
        break;
      }
    }
    expect(found, greaterThanOrEqualTo(9), reason: 'only $found bundled');
  });

  test('the bundle stays small enough to ship', () async {
    var total = 0;
    for (var i = 1; i <= 9; i++) {
      total += (await rootBundle.load('assets/samples/$i.jpg')).lengthInBytes;
    }
    // A booth tablet is provisioned over someone's phone hotspot more often
    // than anyone plans for. Nine photographs of decoration should still fit
    // comfortably inside a megabyte.
    expect(total, lessThan(1024 * 1024), reason: 'samples total \${total}B');
  });
}
