import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../camera/camera_source.dart';
import '../compose/photo_filter.dart';
import '../session/booth_controller.dart';
import '../session/booth_state.dart';
import '../theme/booth_surface.dart';
import '../theme/colors.dart';
import '../theme/shadows.dart';
import '../theme/typography.dart';
import '../widgets/camera_stage.dart';
import '../widgets/motion.dart';
import '../widgets/pill_button.dart';
import '../widgets/qr_view.dart';
import '../widgets/tinted_panel.dart';

/// One screen per state. A booth is a single machine, so routing it as a
/// navigator stack would just invite a customer to press Back out of a paid
/// session; swapping the body on state is both simpler and safer.
class BoothScreen extends StatelessWidget {
  const BoothScreen({super.key, required this.controller});

  final BoothController controller;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final state = controller.state;
        return Scaffold(
          body: Stack(
            children: [
              const _BrandWash(),
              SafeArea(
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 260),
                  child: KeyedSubtree(
                    key: ValueKey(state.runtimeType),
                    child: _body(context, state),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _body(BuildContext context, BoothState state) => switch (state) {
    Idle() => _IdleView(onStart: controller.beginSession),
    CreatingSession() => const _Busy(message: 'Menyiapkan sesi…'),
    AwaitingPayment(:final session, :final secondsLeft) => _PaymentView(
      qrData: session.qrString,
      amountCents: session.amountCents,
      secondsLeft: secondsLeft,
      onCancel: controller.cancelBeforePayment,
    ),
    PaymentExpired() => _ExpiredView(onRetry: controller.reset),
    Paid() => const _PaidView(),
    GetReady(:final shotIndex, :final count, :final session) => _CountdownView(
      count: count,
      camera: controller.camera,
      shotLabel: 'Foto ${shotIndex + 1} dari ${session.shotsPlanned}',
    ),
    Capturing(:final shotIndex, :final session) => _FlashView(
      camera: controller.camera,
      shotLabel: 'Foto ${shotIndex + 1} dari ${session.shotsPlanned}',
    ),
    ShotTaken(
      :final shots,
      :final session,
      :final secondsLeft,
      :final isLast,
    ) =>
      _ShotsView(
        shots: shots,
        total: session.shotsPlanned,
        secondsLeft: secondsLeft,
        isLast: isLast,
        onContinue: controller.continueCapture,
        onRetake: controller.retakeShot,
      ),
    Decorating(:final shots, :final frameId, :final filter) => _DecorateView(
      shots: shots,
      selected: frameId,
      frames: controller.config?.frames ?? const [],
      filter: filter,
      onPick: controller.chooseFrame,
      onPickFilter: controller.chooseFilter,
      onConfirm: controller.confirmFrame,
    ),
    Previewing() => _PreviewView(
      render: controller.renderPreview,
      onPrint: controller.printNow,
    ),
    Printing(:final progress) => _PrintingView(progress: progress),
    PrintFailed(:final session, :final reason) => _PrintFailedView(
      code: session.sessionNumber,
      reason: reason,
      onDone: controller.reset,
    ),
    ThankYou(:final secondsLeft, :final shareUrl) => _ThankYouView(
      secondsLeft: secondsLeft,
      shareUrl: shareUrl,
    ),
    Unregistered(:final reason) => _FatalView(message: reason),
    Fatal(:final message) => _FatalView(message: message),
  };
}

class _BrandWash extends StatelessWidget {
  const _BrandWash();

  @override
  Widget build(BuildContext context) => const Positioned.fill(
    child: DecoratedBox(
      decoration: BoxDecoration(
        gradient: RadialGradient(
          center: Alignment(0, -0.9),
          radius: 1.5,
          colors: [BoothSurface.raised, BoothSurface.base],
        ),
      ),
    ),
  );
}

class _Centered extends StatelessWidget {
  const _Centered({required this.children, this.maxWidth = 900});
  final List<Widget> children;
  final double maxWidth;

  @override
  Widget build(BuildContext context) => Center(
    child: ConstrainedBox(
      constraints: BoxConstraints(maxWidth: maxWidth),
      child: Padding(
        padding: const EdgeInsets.all(SellonSpacing.lg),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: children,
        ),
      ),
    ),
  );
}

class _IdleView extends StatelessWidget {
  const _IdleView({required this.onStart});
  final VoidCallback onStart;

  static const _steps = [
    (Icons.qr_code_rounded, 'Scan & bayar'),
    (Icons.photo_camera_rounded, '4 kali foto'),
    (Icons.auto_awesome_rounded, 'Pilih bingkai'),
    (Icons.print_rounded, 'Ambil cetakan'),
  ];

  @override
  Widget build(BuildContext context) => Stack(
    children: [
      // Slow drift behind everything. Movement is what makes a passer-by
      // look up; a static poster gets walked past.
      Positioned.fill(
        child: DriftingBlobs(
          colors: [
            SellonColors.brand200.withValues(alpha: 0.30),
            SellonColors.brand100.withValues(alpha: 0.38),
            SellonColors.info.withValues(alpha: 0.10),
          ],
        ),
      ),
      Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1180),
          child: Padding(
            padding: const EdgeInsets.all(SellonSpacing.lg),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Expanded(
                  flex: 6,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      FadeInUp(
                        child: Text('PHOTO BOOTH', style: SellonText.eyebrow),
                      ),
                      const SizedBox(height: SellonSpacing.sm),
                      FadeInUp(
                        delay: const Duration(milliseconds: 90),
                        child: Text(
                          'Foto seru,\nlangsung cetak.',
                          style: SellonText.displayXl,
                        ),
                      ),
                      const SizedBox(height: SellonSpacing.md),
                      FadeInUp(
                        delay: const Duration(milliseconds: 180),
                        child: Text(
                          'Bayar pakai QRIS, ambil 4 foto, pilih bingkai.',
                          style: SellonText.body,
                        ),
                      ),
                      const SizedBox(height: SellonSpacing.lg),
                      FadeInUp(
                        delay: const Duration(milliseconds: 260),
                        child: SizedBox(
                          width: 520,
                          child: TintedPanel(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 24,
                              vertical: 24,
                            ),
                            // The highlight walks the four steps so they
                            // read as a sequence, not a row of buttons.
                            child: StepPulse(
                              count: _steps.length,
                              builder: (context, i, t) {
                                final (icon, label) = _steps[i];
                                return _Step(icon: icon, label: label, lit: t);
                              },
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: SellonSpacing.lg),
                      FadeInUp(
                        delay: const Duration(milliseconds: 340),
                        child: Breathe(
                          delay: const Duration(milliseconds: 900),
                          child: PillButton(
                            label: 'Mulai',
                            icon: Icons.photo_camera_rounded,
                            minWidth: 320,
                            onPressed: onStart,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: SellonSpacing.xl),
                // A sample strip, so what you get is visible before you
                // pay rather than described in words.
                const Expanded(flex: 4, child: _SampleStrip()),
              ],
            ),
          ),
        ),
      ),
    ],
  );
}

/// One step in the idle row, brightening as the highlight passes.
class _Step extends StatelessWidget {
  const _Step({required this.icon, required this.label, required this.lit});

  final IconData icon;
  final String label;
  final double lit;

  @override
  Widget build(BuildContext context) {
    final fill = Color.lerp(
      BoothSurface.accentSoft,
      BoothSurface.accentStrong,
      Curves.easeOut.transform(lit),
    )!;
    return Transform.translate(
      offset: Offset(0, -6 * lit),
      child: Column(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: fill,
              borderRadius: BorderRadius.circular(22),
              boxShadow: lit > 0.4
                  ? SellonShadows.elevated
                  : SellonShadows.soft,
            ),
            child: Icon(icon, color: Colors.white, size: 30),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: 96,
            child: Text(
              label,
              textAlign: TextAlign.center,
              style: SellonText.label.copyWith(
                color: Color.lerp(
                  BoothSurface.textMuted,
                  BoothSurface.textPrimary,
                  lit,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// A tilted photo strip that cycles through sample shots. Pure paint — no
/// asset to ship, and it re-colours with the brand hue like everything else.
class _SampleStrip extends StatefulWidget {
  const _SampleStrip();

  @override
  State<_SampleStrip> createState() => _SampleStripState();
}

class _SampleStripState extends State<_SampleStrip>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 12),
  )..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeInUp(
    delay: const Duration(milliseconds: 220),
    offset: 40,
    child: AnimatedBuilder(
      animation: _c,
      builder: (context, _) {
        final tilt = math.sin(_c.value * 2 * math.pi) * 0.018;
        return Transform.rotate(
          angle: -0.04 + tilt,
          child: Container(
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 26),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(SellonRadii.card),
              boxShadow: SellonShadows.popout,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (var i = 0; i < 4; i++)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _SampleFrame(
                      // Each cell advances on its own beat, so the strip
                      // looks like it is still being filled.
                      seed: ((_c.value * 4).floor() + i) % 6,
                    ),
                  ),
                const SizedBox(height: 4),
                Text('PHOTOBOOST', style: SellonText.eyebrow),
              ],
            ),
          ),
        );
      },
    ),
  );
}

class _SampleFrame extends StatelessWidget {
  const _SampleFrame({required this.seed});
  final int seed;

  static const _palette = [
    [Color(0xFFFFD9A0), Color(0xFFE88B6B)],
    [Color(0xFFBFE8D2), Color(0xFF6BBF93)],
    [Color(0xFFCFE0FB), Color(0xFF7FA8E0)],
    [Color(0xFFF6CDE3), Color(0xFFD282B4)],
    [Color(0xFFE8E2C8), Color(0xFFB9A97A)],
    [Color(0xFFD5D2F2), Color(0xFF9B93DB)],
  ];

  @override
  Widget build(BuildContext context) {
    final pair = _palette[seed % _palette.length];
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 520),
      child: Container(
        key: ValueKey(seed),
        width: 210,
        height: 150,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: pair,
          ),
        ),
        child: Center(
          child: Icon(
            Icons.emoji_emotions_rounded,
            size: 56,
            color: Colors.white.withValues(alpha: 0.65),
          ),
        ),
      ),
    );
  }
}

class _Busy extends StatelessWidget {
  const _Busy({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => _Centered(
    children: [
      const CircularProgressIndicator(color: SellonColors.brand600),
      const SizedBox(height: SellonSpacing.md),
      Text(message, style: SellonText.body),
    ],
  );
}

class _PaymentView extends StatelessWidget {
  const _PaymentView({
    required this.qrData,
    required this.amountCents,
    required this.secondsLeft,
    required this.onCancel,
  });

  final String qrData;
  final int amountCents;
  final int secondsLeft;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) => _Centered(
    maxWidth: 980,
    children: [
      Text('PEMBAYARAN', style: SellonText.eyebrow),
      const SizedBox(height: SellonSpacing.sm),
      Text(
        'Scan QRIS untuk mulai',
        style: SellonText.h1.copyWith(color: BoothSurface.textPrimary),
      ),
      const SizedBox(height: SellonSpacing.lg),
      Row(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(SellonRadii.panel),
              boxShadow: SellonShadows.elevated,
            ),
            child: QrView(data: qrData, size: 300),
          ),
          const SizedBox(width: SellonSpacing.xl),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Total bayar', style: SellonText.label),
              Text(
                _rupiah(amountCents),
                style: SellonText.figure.copyWith(
                  color: BoothSurface.textPrimary,
                ),
              ),
              const SizedBox(height: SellonSpacing.md),
              Text(
                'Buka aplikasi bank atau e-wallet,\nlalu scan kode ini.',
                style: SellonText.body,
              ),
              const SizedBox(height: SellonSpacing.md),
              _Countdown(secondsLeft: secondsLeft),
            ],
          ),
        ],
      ),
      const SizedBox(height: SellonSpacing.xl),
      PillButton(
        label: 'Batal',
        variant: PillVariant.ghost,
        onPressed: onCancel,
      ),
    ],
  );
}

class _Countdown extends StatelessWidget {
  const _Countdown({required this.secondsLeft});
  final int secondsLeft;

  @override
  Widget build(BuildContext context) {
    final m = (secondsLeft ~/ 60).toString();
    final s = (secondsLeft % 60).toString().padLeft(2, '0');
    final urgent = secondsLeft <= 30;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          Icons.timer_outlined,
          size: 20,
          color: urgent ? SellonColors.danger : SellonColors.neutral500,
        ),
        const SizedBox(width: 8),
        Text(
          'Berlaku $m:$s',
          style: SellonText.label.copyWith(
            color: urgent ? SellonColors.danger : SellonColors.neutral500,
          ),
        ),
      ],
    );
  }
}

class _ExpiredView extends StatelessWidget {
  const _ExpiredView({required this.onRetry});
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => _Centered(
    children: [
      const IconChip(
        icon: Icons.timer_off_rounded,
        fill: SellonColors.warning,
        size: 88,
      ),
      const SizedBox(height: SellonSpacing.md),
      Text(
        'Waktu pembayaran habis',
        style: SellonText.h1.copyWith(color: BoothSurface.textPrimary),
      ),
      const SizedBox(height: SellonSpacing.sm),
      Text(
        'Tidak ada uang yang terpotong. Silakan mulai lagi.',
        textAlign: TextAlign.center,
        style: SellonText.body,
      ),
      const SizedBox(height: SellonSpacing.xl),
      PillButton(label: 'Mulai lagi', minWidth: 280, onPressed: onRetry),
    ],
  );
}

class _PaidView extends StatelessWidget {
  const _PaidView();

  @override
  Widget build(BuildContext context) => _Centered(
    children: [
      const IconChip(
        icon: Icons.check_rounded,
        fill: SellonColors.success,
        size: 96,
      ),
      const SizedBox(height: SellonSpacing.md),
      Text(
        'Pembayaran diterima',
        style: SellonText.h1.copyWith(color: BoothSurface.textPrimary),
      ),
      const SizedBox(height: SellonSpacing.sm),
      Text(
        'Bersiap ya, fotonya dimulai sebentar lagi.',
        style: SellonText.body,
      ),
    ],
  );
}

/// The countdown, over the live camera: the customer sees themselves
/// full-bleed with the number as an overlay, rather than reading a page.
class _CountdownView extends StatelessWidget {
  const _CountdownView({
    required this.count,
    required this.shotLabel,
    this.camera,
  });

  final int count;
  final String shotLabel;
  final CameraSource? camera;

  @override
  Widget build(BuildContext context) => CameraStage(
    source: camera,
    child: Stack(
      children: [
        Align(
          alignment: Alignment.topCenter,
          child: Padding(
            padding: const EdgeInsets.only(top: 40),
            child: Text(
              shotLabel,
              style: SellonText.eyebrow.copyWith(color: BoothSurface.accent),
            ),
          ),
        ),
        Center(
          child: Container(
            width: 220,
            height: 220,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.75),
                width: 4,
              ),
              color: Colors.black.withValues(alpha: 0.25),
            ),
            child: Text(
              '$count',
              style: SellonText.displayXl.copyWith(
                fontSize: 140,
                color: Colors.white,
                height: 1,
              ),
            ),
          ),
        ),
        Align(
          alignment: Alignment.bottomCenter,
          child: Padding(
            padding: const EdgeInsets.only(bottom: 56),
            child: Text(
              'Siapkan pose terbaikmu',
              style: SellonText.h3.copyWith(color: Colors.white),
            ),
          ),
        ),
      ],
    ),
  );
}

/// The shutter. A white wipe reads as a camera firing; a spinner would read
/// as the booth hanging.
class _FlashView extends StatelessWidget {
  const _FlashView({required this.shotLabel, this.camera});

  final String shotLabel;
  final CameraSource? camera;

  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    children: [
      CameraStage(source: camera),
      const ColoredBox(color: Colors.white),
      Center(
        child: Text(
          'Cekrek!',
          style: SellonText.displayXl.copyWith(color: SellonColors.neutral900),
        ),
      ),
    ],
  );
}

class _ShotsView extends StatelessWidget {
  const _ShotsView({
    required this.shots,
    required this.total,
    required this.secondsLeft,
    required this.isLast,
    required this.onContinue,
    required this.onRetake,
  });

  final List<File> shots;
  final int total;
  final int secondsLeft;
  final bool isLast;
  final VoidCallback onContinue;
  final VoidCallback onRetake;

  @override
  Widget build(BuildContext context) => _Centered(
    maxWidth: 1040,
    children: [
      Text('FOTO ${shots.length} DARI $total', style: SellonText.eyebrow),
      const SizedBox(height: SellonSpacing.sm),
      Text(
        isLast ? 'Semua foto selesai!' : 'Bagus!',
        style: SellonText.h1.copyWith(color: BoothSurface.textPrimary),
      ),
      const SizedBox(height: SellonSpacing.lg),
      Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          for (var i = 0; i < total; i++)
            Padding(
              padding: const EdgeInsets.all(8),
              child: _Thumb(
                file: i < shots.length ? shots[i] : null,
                // The shot just taken is the one being judged.
                highlight: i == shots.length - 1,
              ),
            ),
        ],
      ),
      const SizedBox(height: SellonSpacing.xl),
      Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          PillButton(
            label: 'Ulangi',
            icon: Icons.refresh_rounded,
            variant: PillVariant.secondary,
            onPressed: onRetake,
          ),
          const SizedBox(width: SellonSpacing.md),
          PillButton(
            label: isLast ? 'Pilih bingkai' : 'Lanjut foto',
            icon: isLast
                ? Icons.auto_awesome_rounded
                : Icons.photo_camera_rounded,
            minWidth: 300,
            onPressed: onContinue,
          ),
        ],
      ),
      const SizedBox(height: SellonSpacing.md),
      // Phrased as what will happen, not as a threat: the session is paid
      // and advances on its own, it never expires here.
      Text(
        isLast
            ? 'Lanjut otomatis dalam $secondsLeft detik'
            : 'Foto berikutnya otomatis dalam $secondsLeft detik',
        style: SellonText.label,
      ),
    ],
  );
}

class _Thumb extends StatelessWidget {
  const _Thumb({this.file, this.highlight = false, this.filter});
  final File? file;
  final PhotoFilter? filter;

  /// The shot just taken grows and takes a brand border, so the customer
  /// knows which of the four they are being asked about.
  final bool highlight;

  @override
  Widget build(BuildContext context) => AnimatedContainer(
    duration: const Duration(milliseconds: 260),
    curve: Curves.easeOutCubic,
    width: highlight ? 200 : 170,
    height: highlight ? 150 : 128,
    decoration: BoxDecoration(
      color: BoothSurface.card,
      borderRadius: BorderRadius.circular(SellonRadii.card),
      border: Border.all(
        color: highlight ? BoothSurface.accent : BoothSurface.border,
        width: highlight ? 3 : 1.5,
      ),
      boxShadow: file != null && highlight
          ? BoothSurface.accentGlow(0.6)
          : null,
    ),
    clipBehavior: Clip.antiAlias,
    child: file == null
        ? const Icon(Icons.photo_outlined, color: BoothSurface.textMuted)
        : _filtered(Image.file(file!, fit: BoxFit.cover)),
  );

  /// A thumbnail always shows the treatment that will actually be printed,
  /// so the choice is judged on the customer's own face.
  Widget _filtered(Widget child) {
    final cf = filter?.colorFilter;
    if (cf == null) return child;
    return ColorFiltered(colorFilter: cf, child: child);
  }
}

class _DecorateView extends StatelessWidget {
  const _DecorateView({
    required this.shots,
    required this.selected,
    required this.frames,
    required this.filter,
    required this.onPick,
    required this.onPickFilter,
    required this.onConfirm,
  });

  final List<File> shots;
  final String? selected;
  final List frames;
  final PhotoFilter filter;
  final ValueChanged<String> onPick;
  final ValueChanged<PhotoFilter> onPickFilter;
  final VoidCallback onConfirm;

  @override
  Widget build(BuildContext context) => _Centered(
    maxWidth: 1100,
    children: [
      Text('PERCANTIK FOTOMU', style: SellonText.eyebrow),
      const SizedBox(height: SellonSpacing.sm),
      Text(
        'Pilih bingkai & filter',
        style: SellonText.h1.copyWith(color: BoothSurface.textPrimary),
      ),
      const SizedBox(height: SellonSpacing.lg),

      // Thumbnails show the filter applied, so the choice is judged on the
      // customer's own face rather than on an abstract swatch.
      Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          for (final s in shots.take(4))
            Padding(
              padding: const EdgeInsets.all(6),
              child: _Thumb(file: s, filter: filter),
            ),
        ],
      ),
      const SizedBox(height: SellonSpacing.lg),

      Text('BINGKAI', style: SellonText.eyebrow),
      const SizedBox(height: SellonSpacing.sm),
      Wrap(
        alignment: WrapAlignment.center,
        spacing: 12,
        runSpacing: 12,
        children: [
          for (final f in frames)
            _FrameChip(
              label: f.name as String,
              selected: f.id == selected,
              onTap: () => onPick(f.id as String),
            ),
        ],
      ),
      const SizedBox(height: SellonSpacing.lg),

      Text('FILTER', style: SellonText.eyebrow),
      const SizedBox(height: SellonSpacing.sm),
      Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          for (final f in PhotoFilter.values)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: _FilterChip(
                filter: f,
                sample: shots.isEmpty ? null : shots.first,
                selected: f == filter,
                onTap: () => onPickFilter(f),
              ),
            ),
        ],
      ),

      const SizedBox(height: SellonSpacing.xl),
      PillButton(label: 'Lanjut', minWidth: 320, onPressed: onConfirm),
    ],
  );
}

/// A filter choice, previewed on the customer's own first shot.
class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.filter,
    required this.selected,
    required this.onTap,
    this.sample,
  });

  final PhotoFilter filter;
  final bool selected;
  final VoidCallback onTap;
  final File? sample;

  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(999),
    child: Column(
      children: [
        AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          width: selected ? 92 : 80,
          height: selected ? 92 : 80,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(
              color: selected ? BoothSurface.accent : BoothSurface.border,
              width: selected ? 3 : 1.5,
            ),
            boxShadow: selected ? BoothSurface.accentGlow(0.5) : null,
          ),
          clipBehavior: Clip.antiAlias,
          child: sample == null
              ? const ColoredBox(color: BoothSurface.card)
              : ColorFiltered(
                  // A null filter still needs a widget in the tree, so
                  // normal gets an explicit identity rather than a branch.
                  colorFilter:
                      filter.colorFilter ??
                      const ColorFilter.mode(Colors.transparent, BlendMode.dst),
                  child: Image.file(sample!, fit: BoxFit.cover),
                ),
        ),
        const SizedBox(height: 8),
        Text(
          filter.label,
          style: SellonText.label.copyWith(
            color: selected ? BoothSurface.accent : BoothSurface.textMuted,
          ),
        ),
      ],
    ),
  );
}

class _FrameChip extends StatelessWidget {
  const _FrameChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(SellonRadii.pill),
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 18),
      decoration: BoxDecoration(
        color: selected ? SellonColors.brand50 : Colors.white,
        borderRadius: BorderRadius.circular(SellonRadii.pill),
        border: Border.all(
          color: selected ? SellonColors.brand500 : SellonColors.neutral200,
          width: selected ? 3 : 1.5,
        ),
      ),
      child: Text(
        label,
        style: SellonText.bodyStrong.copyWith(
          color: selected ? SellonColors.brand700 : SellonColors.neutral700,
        ),
      ),
    ),
  );
}

class _PreviewView extends StatelessWidget {
  const _PreviewView({required this.render, required this.onPrint});

  final Future<ui.Image> Function(double width) render;
  final VoidCallback onPrint;

  @override
  Widget build(BuildContext context) => _Centered(
    maxWidth: 760,
    children: [
      Text('HASILNYA', style: SellonText.eyebrow),
      const SizedBox(height: SellonSpacing.sm),
      Text(
        'Sudah pas?',
        style: SellonText.h1.copyWith(color: BoothSurface.textPrimary),
      ),
      const SizedBox(height: SellonSpacing.md),
      // The same renderer the printer uses, at screen width. What is on
      // this screen is what comes out of the printer.
      FutureBuilder<ui.Image>(
        future: render(420),
        builder: (context, snap) {
          if (!snap.hasData) {
            return const SizedBox(
              height: 300,
              child: Center(
                child: CircularProgressIndicator(color: SellonColors.brand600),
              ),
            );
          }
          return Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(SellonRadii.card),
              boxShadow: SellonShadows.elevated,
            ),
            clipBehavior: Clip.antiAlias,
            constraints: const BoxConstraints(maxHeight: 420),
            child: RawImage(image: snap.data, fit: BoxFit.contain),
          );
        },
      ),
      const SizedBox(height: SellonSpacing.lg),
      PillButton(
        label: 'Cetak',
        icon: Icons.print_rounded,
        minWidth: 320,
        onPressed: onPrint,
      ),
    ],
  );
}

class _PrintingView extends StatelessWidget {
  const _PrintingView({required this.progress});
  final double progress;

  @override
  Widget build(BuildContext context) => _Centered(
    maxWidth: 620,
    children: [
      const IconChip(icon: Icons.print_rounded, size: 96),
      const SizedBox(height: SellonSpacing.lg),
      Text(
        'Sedang mencetak…',
        style: SellonText.h1.copyWith(color: BoothSurface.textPrimary),
      ),
      const SizedBox(height: SellonSpacing.md),
      ClipRRect(
        borderRadius: BorderRadius.circular(SellonRadii.pill),
        child: LinearProgressIndicator(
          value: progress,
          minHeight: 16,
          backgroundColor: SellonColors.neutral200,
          valueColor: const AlwaysStoppedAnimation(SellonColors.brand600),
        ),
      ),
      const SizedBox(height: SellonSpacing.sm),
      Text('${(progress * 100).round()}%', style: SellonText.label),
      const SizedBox(height: SellonSpacing.md),
      Text('Tunggu sebentar, jangan tarik kertasnya.', style: SellonText.body),
    ],
  );
}

/// The customer paid and the printer failed. This screen exists so that is
/// recoverable at the counter instead of an argument.
class _PrintFailedView extends StatelessWidget {
  const _PrintFailedView({
    required this.code,
    required this.reason,
    required this.onDone,
  });

  final String code;
  final String reason;
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context) => _Centered(
    maxWidth: 720,
    children: [
      const IconChip(
        icon: Icons.error_outline_rounded,
        fill: SellonColors.danger,
        size: 88,
      ),
      const SizedBox(height: SellonSpacing.md),
      Text(
        'Gagal mencetak',
        style: SellonText.h1.copyWith(color: BoothSurface.textPrimary),
      ),
      const SizedBox(height: SellonSpacing.sm),
      Text(
        'Fotomu aman dan sudah dibayar.\nTunjukkan kode ini ke petugas '
        'untuk dicetak ulang.',
        textAlign: TextAlign.center,
        style: SellonText.body,
      ),
      const SizedBox(height: SellonSpacing.lg),
      TintedPanel(
        tint: BoothSurface.card,
        pattern: false,
        padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 28),
        child: SelectableText(
          code,
          style: SellonText.h2.copyWith(letterSpacing: 2),
        ),
      ),
      const SizedBox(height: SellonSpacing.md),
      Text(reason, style: SellonText.label),
      const SizedBox(height: SellonSpacing.lg),
      PillButton(
        label: 'Selesai',
        variant: PillVariant.secondary,
        minWidth: 260,
        onPressed: onDone,
      ),
    ],
  );
}

class _ThankYouView extends StatelessWidget {
  const _ThankYouView({required this.secondsLeft, this.shareUrl});

  final int secondsLeft;

  /// Null until the upload lands, or for good if it failed. The screen just
  /// omits the QR: the customer has their print either way, and an error
  /// about a copy they may not have wanted would only worry them.
  final String? shareUrl;

  @override
  Widget build(BuildContext context) => _Centered(
    maxWidth: 900,
    children: [
      const IconChip(
        icon: Icons.favorite_rounded,
        fill: BoothSurface.accentStrong,
        size: 88,
      ),
      const SizedBox(height: SellonSpacing.md),
      Text(
        'Makasih ya!',
        style: SellonText.displayXl.copyWith(color: BoothSurface.textPrimary),
      ),
      const SizedBox(height: SellonSpacing.xs),
      Text('Ambil fotomu di bawah printer.', style: SellonText.body),
      const SizedBox(height: SellonSpacing.lg),

      if (shareUrl != null) ...[
        TintedPanel(
          padding: const EdgeInsets.symmetric(horizontal: 36, vertical: 28),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  // White behind the code: a dark QR on a dark panel will
                  // not scan.
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(SellonRadii.card),
                ),
                child: QrView(data: shareUrl!, size: 190),
              ),
              const SizedBox(width: SellonSpacing.lg),
              SizedBox(
                width: 300,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'MAU SIMPAN DI HP?',
                      style: SellonText.eyebrow.copyWith(
                        color: BoothSurface.accent,
                      ),
                    ),
                    const SizedBox(height: SellonSpacing.xs),
                    Text(
                      'Scan QR ini',
                      style: SellonText.h2.copyWith(
                        color: BoothSurface.textPrimary,
                      ),
                    ),
                    const SizedBox(height: SellonSpacing.xs),
                    Text(
                      'Buka kamera HP, arahkan ke kode, lalu simpan fotonya. '
                      'Link berlaku 7 hari.',
                      style: SellonText.body,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: SellonSpacing.lg),
      ],

      Text('Kembali ke awal dalam $secondsLeft detik', style: SellonText.label),
    ],
  );
}

class _FatalView extends StatelessWidget {
  const _FatalView({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => _Centered(
    children: [
      const IconChip(
        icon: Icons.report_rounded,
        fill: SellonColors.danger,
        size: 88,
      ),
      const SizedBox(height: SellonSpacing.md),
      Text(
        'Booth belum siap',
        style: SellonText.h1.copyWith(color: BoothSurface.textPrimary),
      ),
      const SizedBox(height: SellonSpacing.sm),
      Text(message, textAlign: TextAlign.center, style: SellonText.body),
    ],
  );
}

String _rupiah(int cents) {
  final v = cents ~/ 100;
  final s = v.toString();
  final buf = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) buf.write('.');
    buf.write(s[i]);
  }
  return 'Rp $buf';
}
