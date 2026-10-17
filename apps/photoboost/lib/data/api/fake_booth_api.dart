import 'dart:async';
import 'dart:math';

import '../device_credentials.dart';
import 'booth_api.dart';
import 'http_booth_api.dart';
import 'session_dto.dart';

/// A server that is not a server.
///
/// This is how the booth is demonstrated and exercised end to end without a
/// Midtrans key, a backend, or a network: it reproduces the real contract,
/// including the parts that are easy to get wrong — idempotent create,
/// monotonic shot counts, and a payment that only becomes real after a delay,
/// because the single most important screen in the app is the one where a
/// customer is waiting for money to land.
///
/// It is NOT a stub that returns success immediately. A fake that answers
/// instantly would hide every timing bug the real thing has.
class FakeBoothApi implements BoothApi {
  FakeBoothApi({
    this.payAfter = const Duration(seconds: 6),
    this.autoPay = true,
    this.latency = const Duration(milliseconds: 220),
  });

  /// How long the simulated customer takes to scan and pay.
  final Duration payAfter;

  /// When false the QR is never paid — the way to exercise the expiry and
  /// abandon paths.
  final bool autoPay;

  /// Deliberate lag on every call. Real screens have to tolerate it.
  final Duration latency;

  final _sessions = <String, _FakeSession>{};
  final _byIdempotency = <String, String>{};
  var _seq = 0;

  // The booth's price and shot count live here ONCE, because the server
  // derives a session's amount from its config (handler/booth.go: price is
  // never taken from the client) and a fake that hardcodes them separately
  // can quote one price on the idle screen and charge another on the QR —
  // which is exactly what it did.
  static const _priceCents = 500000; // Rp 5.000
  static const _shotsCount = 4;

  @override
  Future<BoothConfig> fetchConfig() async {
    await Future<void>.delayed(latency);
    return BoothConfig(
      priceCents: _priceCents,
      shotsCount: _shotsCount,
      printCopies: 1,
      sessionTimeoutSeconds: 300,
      qrisExpiryMinutes: 10,
      frames: const [
        BoothFrame(id: 'polos', name: 'Polos', imageUrl: '', kind: 'frame'),
        BoothFrame(id: 'pita', name: 'Pita', imageUrl: '', kind: 'frame'),
        BoothFrame(id: 'bintang', name: 'Bintang', imageUrl: '', kind: 'frame'),
        BoothFrame(id: 'hati', name: 'Hati', imageUrl: '', kind: 'frame'),
      ],
      version: 'fake-1',
      boothName: 'Booth Demo',
      boothCode: 'DEMO',
    );
  }

  @override
  Future<BoothSession> createSession({
    required String idempotencyKey,
    String frameId = '',
  }) async {
    await Future<void>.delayed(latency);

    // Replay returns the original, exactly as the server does.
    final existing = _byIdempotency[idempotencyKey];
    if (existing != null) return _sessions[existing]!.toDto();

    _seq++;
    final number = 'PB-DEMO-${_stamp()}-${_suffix()}';
    final s = _FakeSession(
      number: number,
      amountCents: _priceCents,
      shotsPlanned: _shotsCount,
      frameId: frameId,
    );
    _sessions[number] = s;
    _byIdempotency[idempotencyKey] = number;
    return s.toDto();
  }

  @override
  Future<BoothSession> charge(String sessionNumber) async {
    await Future<void>.delayed(latency);
    final s = _require(sessionNumber);

    // Idempotent: a live QR is returned unchanged rather than re-issued.
    if (s.qrString.isNotEmpty) return s.toDto();

    s.status = 'awaiting_payment';
    s.qrString = _fakeEmvPayload(s.amountCents, s.number);
    s.qrExpiresAt = DateTime.now().add(const Duration(minutes: 10));
    s.chargedAt = DateTime.now();

    if (autoPay) {
      // The customer scans and pays a few seconds later. This is what makes
      // the waiting screen real instead of theoretical.
      Timer(payAfter, () {
        if (s.paymentStatus == 'pending') {
          s.paymentStatus = 'paid';
          s.status = 'paid';
          s.paidAt = DateTime.now();
        }
      });
    }
    return s.toDto();
  }

  @override
  Future<BoothSession> getSession(String sessionNumber) async {
    await Future<void>.delayed(latency);
    final s = _require(sessionNumber);
    // Lazy expiry, like the real poll handler.
    if (s.paymentStatus == 'pending' &&
        s.qrExpiresAt != null &&
        s.qrExpiresAt!.isBefore(DateTime.now())) {
      s.paymentStatus = 'expired';
      s.status = 'expired';
    }
    return s.toDto();
  }

  @override
  Future<BoothSession> reportShots(String sessionNumber, int shotsTaken) async {
    await Future<void>.delayed(latency);
    final s = _require(sessionNumber);
    if (s.paymentStatus != 'paid') {
      throw StateError('sesi belum lunas');
    }
    // Monotonic and clamped, matching the SQL.
    s.shotsTaken = min(max(s.shotsTaken, shotsTaken), s.shotsPlanned);
    if (s.status == 'paid') s.status = 'capturing';
    return s.toDto();
  }

  @override
  Future<BoothSession> complete(
    String sessionNumber, {
    required bool succeeded,
    String frameId = '',
    String failureReason = '',
  }) async {
    await Future<void>.delayed(latency);
    final s = _require(sessionNumber);
    if (s.paymentStatus != 'paid') throw StateError('sesi belum lunas');
    s.status = succeeded ? 'completed' : 'failed';
    if (frameId.isNotEmpty) s.frameId = frameId;
    return s.toDto();
  }

  @override
  Future<PhotoShare?> uploadPhoto(
    String sessionNumber,
    List<int> pngBytes,
  ) async {
    await Future<void>.delayed(latency);
    final s = _require(sessionNumber);
    if (s.paymentStatus != 'paid') return null;
    return PhotoShare(
      shareUrl: 'https://sellon.id/foto/${_fakeToken(sessionNumber)}',
      expiresAt: DateTime.now().add(const Duration(days: 7)),
    );
  }

  String _fakeToken(String seed) {
    final r = Random(seed.hashCode);
    return List.generate(64, (_) => '0123456789abcdef'[r.nextInt(16)]).join();
  }

  @override
  Future<void> heartbeat({
    required String appVersion,
    required bool printerOk,
    required bool paperLow,
  }) async {
    await Future<void>.delayed(latency);
  }

  /// Marks the pending session paid immediately — the demo's "pretend the
  /// customer just scanned" button.
  void payNow(String sessionNumber) {
    final s = _sessions[sessionNumber];
    if (s != null && s.paymentStatus == 'pending') {
      s.paymentStatus = 'paid';
      s.status = 'paid';
      s.paidAt = DateTime.now();
    }
  }

  _FakeSession _require(String number) {
    final s = _sessions[number];
    if (s == null) throw StateError('sesi tidak ditemukan: $number');
    return s;
  }

  String _stamp() {
    final n = DateTime.now();
    final y = (n.year % 100).toString().padLeft(2, '0');
    return '$y${n.month.toString().padLeft(2, '0')}${n.day.toString().padLeft(2, '0')}';
  }

  String _suffix() {
    const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    final r = Random(_seq * 7919);
    return List.generate(6, (_) => alphabet[r.nextInt(alphabet.length)]).join();
  }

  /// Shaped like a QRIS EMV payload so the QR widget renders something of a
  /// realistic density. Not a valid code — nothing can be paid with it.
  String _fakeEmvPayload(int cents, String ref) =>
      '00020101021226610014COM.DEMO.WWW0118936009140000000000'
      '0215${cents ~/ 100}5802ID5920PHOTOBOOST DEMO6007JAKARTA'
      '62${ref.length.toString().padLeft(2, '0')}${ref}6304FAKE';
}

class _FakeSession {
  _FakeSession({
    required this.number,
    required this.amountCents,
    required this.shotsPlanned,
    this.frameId = '',
  }) : createdAt = DateTime.now();

  final String number;
  final int amountCents;
  final int shotsPlanned;
  final DateTime createdAt;

  String status = 'created';
  String paymentStatus = 'pending';
  String frameId;
  int shotsTaken = 0;
  String qrString = '';
  DateTime? qrExpiresAt;
  DateTime? chargedAt;
  DateTime? paidAt;

  BoothSession toDto() => BoothSession(
    sessionNumber: number,
    status: status,
    paymentStatus: paymentStatus,
    amountCents: amountCents,
    shotsPlanned: shotsPlanned,
    shotsTaken: shotsTaken,
    printCopies: 1,
    frameId: frameId,
    qrString: qrString,
    qrUrl: '',
    createdAt: createdAt,
    qrExpiresAt: qrExpiresAt,
    paidAt: paidAt,
  );
}

/// The demo code the fake pairing accepts.
///
/// Drawn from the same alphabet the server mints from — no O/0/I/1/L — so
/// it is typeable on the real keypad. The obvious choice, DEMO23, is not:
/// the keypad has no O, which only showed up when someone tried to type it.
/// A test pins this.
const kDemoPairingCode = 'TEST23';

/// Pairing, answered locally.
///
/// Demo mode still walks the operator through pairing rather than skipping
/// it: the screen a technician sees on day one is the screen we should be
/// demoing, and a shortcut that hides it is how it shipped unreachable.
///
/// Wrong codes fail the way the server fails them, so the error path is
/// demoable too.
Future<PairingResult> fakePairDevice({
  required String baseUrl,
  required String code,
  required String deviceName,
  required String appVersion,
}) async {
  await Future<void>.delayed(const Duration(milliseconds: 600));
  if (code.toUpperCase() != kDemoPairingCode) {
    throw const BoothApiException(
      'Kode tidak berlaku atau sudah dipakai',
      statusCode: 401,
    );
  }
  return PairingResult(
    credentials: const DeviceCredentials(
      token: 'pbt_demo',
      baseUrl: 'demo',
      booth: BoothIdentity(
        id: 'demo-booth',
        code: 'DEMO',
        name: 'Booth Demo',
        location: 'Mode demo',
      ),
    ),
    config: await FakeBoothApi().fetchConfig(),
  );
}
