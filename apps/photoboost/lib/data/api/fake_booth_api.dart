import 'dart:async';
import 'dart:math';

import 'booth_api.dart';
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

  @override
  Future<BoothConfig> fetchConfig() async {
    await Future<void>.delayed(latency);
    return BoothConfig(
      priceCents: 500000, // Rp 5.000 — matches the platform default
      shotsCount: 4,
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
      amountCents: 2500000,
      shotsPlanned: 4,
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
