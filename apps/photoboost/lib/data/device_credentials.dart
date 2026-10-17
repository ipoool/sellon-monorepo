import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// Which booth this tablet is, as the server told it at pairing time.
class BoothIdentity {
  const BoothIdentity({
    required this.id,
    required this.code,
    required this.name,
    required this.location,
  });

  final String id;
  final String code;
  final String name;
  final String location;

  Map<String, dynamic> toJson() => {
    'id': id,
    'code': code,
    'name': name,
    'location': location,
  };

  factory BoothIdentity.fromJson(Map<String, dynamic> j) => BoothIdentity(
    id: j['id'] as String? ?? '',
    code: j['code'] as String? ?? '',
    name: j['name'] as String? ?? '',
    location: j['location'] as String? ?? '',
  );
}

/// The device token plus the identity it authenticates as.
class DeviceCredentials {
  const DeviceCredentials({
    required this.token,
    required this.booth,
    required this.baseUrl,
  });

  final String token;
  final BoothIdentity booth;

  /// Stored alongside the token because a token is only meaningful against
  /// the server that issued it. Repointing a tablet at another environment
  /// without re-pairing would otherwise fail as a confusing 401.
  final String baseUrl;

  Map<String, dynamic> toJson() => {
    'token': token,
    'base_url': baseUrl,
    'booth': booth.toJson(),
  };

  factory DeviceCredentials.fromJson(Map<String, dynamic> j) =>
      DeviceCredentials(
        token: j['token'] as String? ?? '',
        baseUrl: j['base_url'] as String? ?? '',
        booth: BoothIdentity.fromJson(
          (j['booth'] as Map?)?.cast<String, dynamic>() ?? const {},
        ),
      );
}

/// Where the booth's credential lives between reboots.
///
/// A plain file in app-private storage, not a keystore. The threat this has
/// to survive is a tablet that reboots overnight, not an attacker holding the
/// device: anyone with that much access to an unattended kiosk can read the
/// screen and take the money directly. What limits the damage is that the
/// token authenticates one booth, can be revoked from the console the moment
/// a tablet goes missing, and buys nothing except the right to sell photos.
class CredentialStore {
  CredentialStore({this.overrideDirectory});

  /// Lets tests point the store at a temp directory without a plugin.
  final Directory? overrideDirectory;

  static const _fileName = 'booth_credentials.json';
  DeviceCredentials? _cached;

  Future<File> _file() async {
    final dir = overrideDirectory ?? await getApplicationSupportDirectory();
    await dir.create(recursive: true);
    return File('${dir.path}/$_fileName');
  }

  /// The stored credential, or null when this tablet has never been paired.
  ///
  /// A corrupt file reads as "not paired" rather than as a crash: the booth
  /// then shows the pairing screen, which an operator can actually act on,
  /// instead of a start-up failure in a mall with nobody around.
  Future<DeviceCredentials?> load() async {
    if (_cached != null) return _cached;
    try {
      final f = await _file();
      if (!await f.exists()) return null;
      final raw = jsonDecode(await f.readAsString());
      final creds = DeviceCredentials.fromJson(
        (raw as Map).cast<String, dynamic>(),
      );
      if (creds.token.isEmpty) return null;
      _cached = creds;
      return creds;
    } catch (_) {
      return null;
    }
  }

  Future<void> save(DeviceCredentials creds) async {
    _cached = creds;
    final f = await _file();
    await f.writeAsString(jsonEncode(creds.toJson()), flush: true);
  }

  /// Forgets this device's pairing. Called when the console revokes the token
  /// (the server answers 401) and when an operator un-pairs on purpose.
  Future<void> clear() async {
    _cached = null;
    try {
      final f = await _file();
      if (await f.exists()) await f.delete();
    } catch (_) {
      // Nothing useful to do: the next pairing overwrites it anyway.
    }
  }
}
