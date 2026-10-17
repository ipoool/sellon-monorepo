import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:photoboost/data/api/http_booth_api.dart';
import 'package:photoboost/data/api/session_dto.dart';
import 'package:photoboost/data/device_credentials.dart';
import 'package:photoboost/data/api/fake_booth_api.dart';
import 'package:photoboost/features/pairing_screen.dart';
import 'package:photoboost/main.dart';

const _booth = BoothIdentity(
  id: 'b1',
  code: 'JKT01',
  name: 'Grand Indonesia L3',
  location: 'Jakarta Pusat',
);

PairingResult _result() => PairingResult(
  credentials: const DeviceCredentials(
    token: 'pbt_abc123',
    booth: _booth,
    baseUrl: 'https://sellon.id',
  ),
  config: const BoothConfig(
    priceCents: 2500000,
    shotsCount: 4,
    printCopies: 1,
    sessionTimeoutSeconds: 300,
    qrisExpiryMinutes: 10,
    frames: [],
    version: 'v1',
    boothName: 'Grand Indonesia L3',
    boothCode: 'JKT01',
  ),
);

Future<void> _pumpPast(WidgetTester tester) async {
  // The screen stages itself in and the background never settles by design,
  // so pump a fixed number of frames rather than pumpAndSettle.
  for (var i = 0; i < 15; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  _demoCodeIsTypeable();
  group('CredentialStore', () {
    late Directory dir;

    setUp(() => dir = Directory.systemTemp.createTempSync('pb-creds'));
    tearDown(() => dir.deleteSync(recursive: true));

    test('a paired booth survives a restart', () async {
      final store = CredentialStore(overrideDirectory: dir);
      expect(await store.load(), isNull, reason: 'a fresh tablet is unpaired');

      await store.save(
        const DeviceCredentials(
          token: 'pbt_secret',
          booth: _booth,
          baseUrl: 'https://sellon.id',
        ),
      );

      // A second store over the same directory stands in for the next boot:
      // the in-memory cache must not be what makes this pass.
      final reopened = CredentialStore(overrideDirectory: dir);
      final loaded = await reopened.load();
      expect(loaded, isNotNull);
      expect(loaded!.token, 'pbt_secret');
      expect(loaded.booth.code, 'JKT01');
      expect(loaded.baseUrl, 'https://sellon.id');
    });

    test('clearing really un-pairs the tablet', () async {
      final store = CredentialStore(overrideDirectory: dir);
      await store.save(
        const DeviceCredentials(
          token: 'pbt_secret',
          booth: _booth,
          baseUrl: 'https://sellon.id',
        ),
      );
      await store.clear();
      expect(await store.load(), isNull);
      expect(await CredentialStore(overrideDirectory: dir).load(), isNull);
    });

    test('a corrupt file reads as unpaired, not as a crash', () async {
      File(
        '${dir.path}/booth_credentials.json',
      ).writeAsStringSync('{ not json');
      // A booth that cannot parse its credential must still reach a screen
      // an operator can act on, rather than failing to start in a mall.
      expect(await CredentialStore(overrideDirectory: dir).load(), isNull);
    });
  });

  group('BoothHost', () {
    testWidgets('an unpaired tablet shows the keypad, never the idle screen', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(const Size(1280, 800));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      // An empty store: the state a tablet is in out of the box.
      final dir = Directory.systemTemp.createTempSync('pb-unpaired');
      addTearDown(() => dir.deleteSync(recursive: true));

      // Mounted INSIDE runAsync: _boot() starts in initState and awaits real
      // file I/O. Suspended in the test's fake-async zone it would never
      // resume, and the host would sit on its splash forever.
      await tester.runAsync(() async {
        await tester.pumpWidget(
          PhotoBoostApp(store: CredentialStore(overrideDirectory: dir)),
        );
        await Future<void>.delayed(const Duration(milliseconds: 300));
      });
      for (var i = 0; i < 20; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }

      expect(find.byType(PairingScreen), findsOneWidget);
      // Demo mode used to skip pairing and boot straight here, which left
      // the keypad unreachable in the only build anyone ran.
      expect(find.text('Mulai'), findsNothing);
      expect(find.text('PHOTO BOOTH'), findsNothing);
    });
  });

  group('fakePairDevice', () {
    test('accepts the demo code and refuses anything else', () async {
      final ok = await fakePairDevice(
        baseUrl: 'demo',
        code: kDemoPairingCode.toLowerCase(),
        deviceName: 'tablet',
        appVersion: 'test',
      );
      expect(ok.credentials.token, isNotEmpty);

      await expectLater(
        fakePairDevice(
          baseUrl: 'demo',
          code: 'ZZZZZZ',
          deviceName: 'tablet',
          appVersion: 'test',
        ),
        throwsA(isA<BoothApiException>()),
      );
    });
  });

  group('PairingScreen', () {
    testWidgets('six keys pair the tablet without a separate submit', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(const Size(1280, 800));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      String? sentCode;
      PairingResult? paired;

      await tester.pumpWidget(
        MaterialApp(
          home: PairingScreen(
            baseUrl: 'https://sellon.id',
            appVersion: 'test',
            onPaired: (r) => paired = r,
            pair:
                ({
                  required String baseUrl,
                  required String code,
                  required String deviceName,
                  required String appVersion,
                }) async {
                  sentCode = code;
                  return _result();
                },
          ),
        ),
      );
      await _pumpPast(tester);

      await tester.enterText(find.byType(TextField), 'ABCDEF');
      await _pumpPast(tester);

      expect(sentCode, 'ABCDEF');
      expect(paired, isNotNull);
      expect(paired!.credentials.booth.code, 'JKT01');
    });

    testWidgets('a rejected code is cleared, not left on screen', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(const Size(1280, 800));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      var attempts = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: PairingScreen(
            baseUrl: 'https://sellon.id',
            appVersion: 'test',
            onPaired: (_) {},
            pair:
                ({
                  required String baseUrl,
                  required String code,
                  required String deviceName,
                  required String appVersion,
                }) async {
                  attempts++;
                  throw const BoothApiException(
                    'Kode tidak berlaku atau sudah dipakai',
                    statusCode: 401,
                  );
                },
          ),
        ),
      );
      await _pumpPast(tester);

      await tester.enterText(find.byType(TextField), 'ABCDEF');
      await _pumpPast(tester);

      expect(attempts, 1);
      expect(
        find.text('Kode tidak berlaku atau sudah dipakai'),
        findsOneWidget,
      );
      // Every failure here means those six characters are dead. Leaving
      // them on screen would invite the operator to retype around the same
      // bad code, so the field and the slots must both be empty.
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        isEmpty,
      );
      expect(find.text('A'), findsNothing);
    });

    testWidgets('a revoked tablet is told which booth it used to be', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(const Size(1280, 800));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(
        MaterialApp(
          home: PairingScreen(
            baseUrl: 'https://sellon.id',
            appVersion: 'test',
            previousBooth: _booth,
            onPaired: (_) {},
          ),
        ),
      );
      await _pumpPast(tester);

      expect(
        find.textContaining('tidak lagi terhubung ke booth JKT01'),
        findsOneWidget,
      );
    });
  });
}

/// The demo code must be typeable on the booth's own keypad.
///
/// The keypad omits O/0/I/1/L because those are misread off a screen. A demo
/// code containing one is a locked door: the hint tells you what to type and
/// the keys to type it do not exist. DEMO23 was exactly that.
void _demoCodeIsTypeable() {
  test('the demo pairing code uses only keys the keypad has', () {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    for (final ch in kDemoPairingCode.split('')) {
      expect(
        alphabet.contains(ch),
        isTrue,
        reason: '"$ch" in $kDemoPairingCode is not on the keypad',
      );
    }
    expect(kDemoPairingCode.length, 6);
  });
}
