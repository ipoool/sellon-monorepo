import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:photoboost/data/api/http_booth_api.dart';
import 'package:photoboost/data/api/session_dto.dart';
import 'package:photoboost/data/device_credentials.dart';
import 'package:photoboost/features/pairing_screen.dart';

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

      for (final ch in ['A', 'B', 'C', 'D', 'E', 'F']) {
        await tester.tap(find.widgetWithText(InkWell, ch));
        await tester.pump();
      }
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

      for (final ch in ['A', 'B', 'C', 'D', 'E', 'F']) {
        await tester.tap(find.widgetWithText(InkWell, ch));
        await tester.pump();
      }
      await _pumpPast(tester);

      expect(attempts, 1);
      expect(
        find.text('Kode tidak berlaku atau sudah dipakai'),
        findsOneWidget,
      );
      // Every failure here means those six characters are dead. Leaving them
      // on screen would invite the operator to retry the same bad code.
      expect(find.widgetWithText(InkWell, 'A'), findsOneWidget);
      final slotTexts = tester
          .widgetList<Text>(find.byType(Text))
          .where((t) => t.data == 'A')
          .length;
      expect(
        slotTexts,
        1,
        reason: 'the A slot was cleared; only the key remains',
      );
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
