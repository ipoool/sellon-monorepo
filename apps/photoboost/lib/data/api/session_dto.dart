/// What the booth endpoints return. Mirrors boothSessionDTO in
/// api/internal/handler/booth.go — deliberately narrow: a tablet has no
/// business knowing review reasons or booth internals.
class BoothSession {
  const BoothSession({
    required this.sessionNumber,
    required this.status,
    required this.paymentStatus,
    required this.amountCents,
    required this.shotsPlanned,
    required this.shotsTaken,
    required this.printCopies,
    required this.frameId,
    required this.qrString,
    required this.qrUrl,
    required this.createdAt,
    this.qrExpiresAt,
    this.paidAt,
  });

  final String sessionNumber;
  final String status;
  final String paymentStatus;
  final int amountCents;
  final int shotsPlanned;
  final int shotsTaken;
  final int printCopies;
  final String frameId;
  final String qrString;
  final String qrUrl;
  final DateTime createdAt;
  final DateTime? qrExpiresAt;
  final DateTime? paidAt;

  bool get isPaid => paymentStatus == 'paid';
  bool get isExpired => paymentStatus == 'expired' || status == 'expired';

  /// True when there is something to show the customer. The app prefers the
  /// string and renders the QR itself, so a flaky route to Midtrans's CDN
  /// cannot leave the screen blank with the customer standing there.
  bool get hasQr => qrString.isNotEmpty || qrUrl.isNotEmpty;

  factory BoothSession.fromJson(Map<String, dynamic> j) => BoothSession(
    sessionNumber: j['session_number'] as String,
    status: j['status'] as String? ?? 'created',
    paymentStatus: j['payment_status'] as String? ?? 'pending',
    amountCents: (j['amount_cents'] as num?)?.toInt() ?? 0,
    shotsPlanned: (j['shots_planned'] as num?)?.toInt() ?? 4,
    shotsTaken: (j['shots_taken'] as num?)?.toInt() ?? 0,
    printCopies: (j['print_copies'] as num?)?.toInt() ?? 1,
    frameId: j['frame_id'] as String? ?? '',
    qrString: j['qr_string'] as String? ?? '',
    qrUrl: j['qr_url'] as String? ?? '',
    createdAt:
        DateTime.tryParse(j['created_at'] as String? ?? '') ?? DateTime.now(),
    qrExpiresAt: DateTime.tryParse(j['qr_expires_at'] as String? ?? ''),
    paidAt: DateTime.tryParse(j['paid_at'] as String? ?? ''),
  );
}

/// One uploaded frame or sticker overlay.
class BoothFrame {
  const BoothFrame({
    required this.id,
    required this.name,
    required this.imageUrl,
    required this.kind,
  });

  final String id;
  final String name;
  final String imageUrl;
  final String kind; // "frame" | "sticker"

  factory BoothFrame.fromJson(Map<String, dynamic> j) => BoothFrame(
    id: j['id'] as String? ?? '',
    name: j['name'] as String? ?? '',
    imageUrl: j['image_url'] as String? ?? '',
    kind: j['kind'] as String? ?? 'frame',
  );
}

/// The effective config: this booth's overrides already resolved against the
/// platform defaults, server-side. The app never does that arithmetic, so it
/// cannot disagree with the admin console about the price.
class BoothConfig {
  const BoothConfig({
    required this.priceCents,
    required this.shotsCount,
    required this.printCopies,
    required this.sessionTimeoutSeconds,
    required this.qrisExpiryMinutes,
    required this.frames,
    required this.version,
    required this.boothName,
    required this.boothCode,
  });

  final int priceCents;
  final int shotsCount;
  final int printCopies;
  final int sessionTimeoutSeconds;
  final int qrisExpiryMinutes;
  final List<BoothFrame> frames;
  final String version;
  final String boothName;
  final String boothCode;

  factory BoothConfig.fromJson(Map<String, dynamic> j) {
    final c = (j['config'] as Map).cast<String, dynamic>();
    final b = (j['booth'] as Map?)?.cast<String, dynamic>() ?? const {};
    return BoothConfig(
      priceCents: (c['price_cents'] as num?)?.toInt() ?? 0,
      shotsCount: (c['shots_count'] as num?)?.toInt() ?? 4,
      printCopies: (c['print_copies'] as num?)?.toInt() ?? 1,
      sessionTimeoutSeconds:
          (c['session_timeout_seconds'] as num?)?.toInt() ?? 300,
      qrisExpiryMinutes: (c['qris_expiry_minutes'] as num?)?.toInt() ?? 10,
      frames: ((c['frames'] as List?) ?? const [])
          .map((f) => BoothFrame.fromJson((f as Map).cast<String, dynamic>()))
          .toList(),
      version: j['config_version'] as String? ?? '',
      boothName: b['name'] as String? ?? '',
      boothCode: b['code'] as String? ?? '',
    );
  }
}
