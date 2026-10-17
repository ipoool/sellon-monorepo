import 'dart:convert';
import 'dart:io';

import '../device_credentials.dart';
import 'booth_api.dart';
import 'session_dto.dart';

/// Thrown when the server rejects this device's token.
///
/// Its own type because it is the one error the app must not retry: an admin
/// revoked the token, so the booth has to stop selling and go back to the
/// pairing screen. Treating it as a transient network failure would leave a
/// tablet politely retrying a credential that is never coming back.
class BoothUnauthorized implements Exception {
  const BoothUnauthorized(this.message);
  final String message;
  @override
  String toString() => 'BoothUnauthorized: $message';
}

/// A server-side failure with a message meant for the screen.
class BoothApiException implements Exception {
  const BoothApiException(this.message, {this.statusCode = 0});
  final String message;
  final int statusCode;
  @override
  String toString() => 'BoothApiException($statusCode): $message';
}

/// The result of redeeming a pairing code: a credential plus the config the
/// booth needs, in one answer, so setup cannot finish half-done.
class PairingResult {
  const PairingResult({required this.credentials, required this.config});
  final DeviceCredentials credentials;
  final BoothConfig config;
}

/// Trades a pairing code for a device token.
///
/// A free function rather than a method, because the whole point is that it
/// runs before this tablet has a credential — there is no authenticated
/// client to hang it off yet.
Future<PairingResult> pairDevice({
  required String baseUrl,
  required String code,
  required String deviceName,
  required String appVersion,
}) async {
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 15);
  try {
    final req = await client.postUrl(
      Uri.parse('${_trimBase(baseUrl)}/api/v1/photobooth/pair'),
    );
    req.headers.contentType = ContentType.json;
    req.write(
      jsonEncode({
        'code': code,
        'device_name': deviceName,
        'app_version': appVersion,
      }),
    );
    final res = await req.close();
    final body = await res.transform(utf8.decoder).join();
    final json = _decode(body);

    if (res.statusCode == 401) {
      throw BoothApiException(
        _errorOf(json) ?? 'Kode tidak berlaku atau sudah dipakai',
        statusCode: 401,
      );
    }
    if (res.statusCode >= 400) {
      throw BoothApiException(
        _errorOf(json) ?? 'Gagal menghubungkan (${res.statusCode})',
        statusCode: res.statusCode,
      );
    }

    final token = json['device_token'] as String? ?? '';
    if (token.isEmpty) {
      throw const BoothApiException('Server tidak mengirim token perangkat');
    }
    final booth = (json['booth'] as Map?)?.cast<String, dynamic>() ?? const {};
    return PairingResult(
      credentials: DeviceCredentials(
        token: token,
        baseUrl: _trimBase(baseUrl),
        booth: BoothIdentity.fromJson(booth),
      ),
      config: BoothConfig.fromJson(json),
    );
  } on SocketException {
    throw const BoothApiException(
      'Tidak bisa menghubungi server. Cek koneksi internet booth.',
    );
  } on HttpException catch (e) {
    throw BoothApiException(e.message);
  } finally {
    client.close();
  }
}

/// The real BoothApi: /api/v1/booth/* with a bearer device token.
///
/// Built on dart:io rather than a package, because what it needs — JSON over
/// HTTPS and one multipart upload — is a few dozen lines, and a kiosk's
/// dependency list is a thing you have to keep alive for years.
class HttpBoothApi implements BoothApi {
  HttpBoothApi({
    required this.credentials,
    required this.appVersion,
    this.onUnauthorized,
  });

  final DeviceCredentials credentials;
  final String appVersion;

  /// Called when the server rejects the token. The host clears the stored
  /// credential and sends the booth back to pairing.
  final Future<void> Function()? onUnauthorized;

  String get _base => credentials.baseUrl;

  HttpClient _client() =>
      HttpClient()..connectionTimeout = const Duration(seconds: 15);

  Future<Map<String, dynamic>> _send(
    String method,
    String path, {
    Map<String, dynamic>? body,
  }) async {
    final client = _client();
    try {
      final uri = Uri.parse('$_base/api/v1/booth$path');
      final req = await client.openUrl(method, uri);
      req.headers.set(
        HttpHeaders.authorizationHeader,
        'Bearer ${credentials.token}',
      );
      if (body != null) {
        req.headers.contentType = ContentType.json;
        req.write(jsonEncode(body));
      }
      final res = await req.close();
      final text = await res.transform(utf8.decoder).join();
      return _handle(res.statusCode, text);
    } on SocketException {
      throw const BoothApiException('Koneksi ke server terputus');
    } finally {
      client.close();
    }
  }

  Future<Map<String, dynamic>> _handle(int status, String text) async {
    final json = _decode(text);
    if (status == 401) {
      // Revoked, or paired against a different server. Either way this
      // tablet is no longer a booth until someone pairs it again.
      await onUnauthorized?.call();
      throw BoothUnauthorized(_errorOf(json) ?? 'Token perangkat dicabut');
    }
    if (status >= 400) {
      throw BoothApiException(
        _errorOf(json) ?? 'Server menolak permintaan ($status)',
        statusCode: status,
      );
    }
    return json;
  }

  @override
  Future<BoothConfig> fetchConfig() async =>
      BoothConfig.fromJson(await _send('GET', '/config'));

  @override
  Future<BoothSession> createSession({
    required String idempotencyKey,
    String frameId = '',
  }) async => BoothSession.fromJson(
    await _send(
      'POST',
      '/sessions',
      body: {
        'idempotency_key': idempotencyKey,
        'frame_id': frameId,
        'app_version': appVersion,
      },
    ),
  );

  @override
  Future<BoothSession> charge(String sessionNumber) async =>
      BoothSession.fromJson(
        await _send('POST', '/sessions/$sessionNumber/charge'),
      );

  @override
  Future<BoothSession> getSession(String sessionNumber) async =>
      BoothSession.fromJson(await _send('GET', '/sessions/$sessionNumber'));

  @override
  Future<BoothSession> reportShots(
    String sessionNumber,
    int shotsTaken,
  ) async => BoothSession.fromJson(
    await _send(
      'POST',
      '/sessions/$sessionNumber/shots',
      body: {'shots_taken': shotsTaken},
    ),
  );

  @override
  Future<BoothSession> complete(
    String sessionNumber, {
    required bool succeeded,
    String frameId = '',
    String failureReason = '',
  }) async => BoothSession.fromJson(
    await _send(
      'POST',
      '/sessions/$sessionNumber/complete',
      body: {
        'outcome': succeeded ? 'completed' : 'failed',
        'frame_id': frameId,
        'failure_reason': failureReason,
      },
    ),
  );

  @override
  Future<PhotoShare?> uploadPhoto(
    String sessionNumber,
    List<int> pngBytes,
  ) async {
    final client = _client();
    try {
      final boundary = 'photoboost${DateTime.now().microsecondsSinceEpoch}';
      final req = await client.postUrl(
        Uri.parse('$_base/api/v1/booth/sessions/$sessionNumber/photo'),
      );
      req.headers.set(
        HttpHeaders.authorizationHeader,
        'Bearer ${credentials.token}',
      );
      req.headers.contentType = ContentType(
        'multipart',
        'form-data',
        parameters: {'boundary': boundary},
      );

      req.add(
        utf8.encode(
          '--$boundary\r\n'
          'Content-Disposition: form-data; name="file"; filename="strip.png"\r\n'
          'Content-Type: image/png\r\n\r\n',
        ),
      );
      req.add(pngBytes);
      req.add(utf8.encode('\r\n--$boundary--\r\n'));

      final res = await req.close();
      final text = await res.transform(utf8.decoder).join();
      final json = await _handle(res.statusCode, text);
      return PhotoShare.fromJson(json);
    } on BoothUnauthorized {
      rethrow;
    } catch (_) {
      // The soft copy is a bonus; the customer already has the print. A
      // failed upload must never be allowed to look like a failed session.
      return null;
    } finally {
      client.close();
    }
  }

  @override
  Future<void> heartbeat({
    required String appVersion,
    required bool printerOk,
    required bool paperLow,
  }) async {
    await _send(
      'POST',
      '/heartbeat',
      body: {
        'app_version': appVersion,
        'printer_ok': printerOk,
        'paper_low': paperLow,
      },
    );
  }
}

String _trimBase(String url) {
  var out = url.trim();
  while (out.endsWith('/')) {
    out = out.substring(0, out.length - 1);
  }
  return out;
}

Map<String, dynamic> _decode(String body) {
  if (body.isEmpty) return const {};
  try {
    final v = jsonDecode(body);
    return v is Map ? v.cast<String, dynamic>() : const {};
  } catch (_) {
    return const {};
  }
}

/// The API's error envelope is {"error": "..."} across every handler.
String? _errorOf(Map<String, dynamic> json) {
  final e = json['error'];
  if (e is String && e.trim().isNotEmpty) return e;
  return null;
}
