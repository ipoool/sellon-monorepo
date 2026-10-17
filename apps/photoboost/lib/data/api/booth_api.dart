import '../../data/api/session_dto.dart';

/// What the booth needs from the server.
///
/// An interface, not a concrete client, for the same reason the camera and
/// printer are: it lets the whole flow run — and be demonstrated — before the
/// platform Midtrans key exists, against FakeBoothApi. The real
/// implementation talks to /api/v1/booth/*.
abstract class BoothApi {
  Future<BoothConfig> fetchConfig();

  /// [idempotencyKey] must be stable across retries of the SAME customer
  /// press. The server returns the original session for a repeat, so a
  /// flaky link converges on one charge instead of two.
  Future<BoothSession> createSession({
    required String idempotencyKey,
    String frameId,
  });

  Future<BoothSession> charge(String sessionNumber);

  Future<BoothSession> getSession(String sessionNumber);

  Future<BoothSession> reportShots(String sessionNumber, int shotsTaken);

  Future<BoothSession> complete(
    String sessionNumber, {
    required bool succeeded,
    String frameId,
    String failureReason,
  });

  Future<void> heartbeat({
    required String appVersion,
    required bool printerOk,
    required bool paperLow,
  });
}
