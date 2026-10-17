import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../data/api/http_booth_api.dart';
import '../data/device_credentials.dart';
import '../theme/booth_surface.dart';
import '../theme/typography.dart';
import '../widgets/motion.dart';
import '../widgets/pill_button.dart';

/// The alphabet the server mints codes from. No O/0 or I/1/L, so there is
/// nothing on this keypad an operator can press by mistake for another.
const _alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const _codeLength = 6;

/// First-run setup: turn this tablet into a booth.
///
/// Seen twice in a booth's life — the day it is installed, and the day a
/// token is revoked — and both times by a technician standing in a mall, not
/// a developer at a desk. So it takes a six-character code on a keypad built
/// for the purpose, instead of a 64-character token through a soft keyboard
/// that autocorrects and offers to save passwords.
class PairingScreen extends StatefulWidget {
  const PairingScreen({
    super.key,
    required this.baseUrl,
    required this.appVersion,
    required this.onPaired,
    this.previousBooth,
    this.pair = pairDevice,
    this.hint,
  });

  final String baseUrl;
  final String appVersion;

  /// Handed the credential and the config, both already fetched.
  final void Function(PairingResult result) onPaired;

  /// Set when this screen appeared because a token was revoked rather than
  /// because the tablet is new. Saying which booth it used to be is the
  /// difference between "something broke" and "someone un-paired this".
  final BoothIdentity? previousBooth;

  /// Shown under the keypad in place of the usual instruction. Demo mode
  /// puts the code there, because a keypad with no reachable code is a
  /// locked door.
  final String? hint;

  /// The redemption call, injectable the same way the camera and printer
  /// are, so the keypad's behaviour can be tested without a server.
  final Future<PairingResult> Function({
    required String baseUrl,
    required String code,
    required String deviceName,
    required String appVersion,
  })
  pair;

  @override
  State<PairingScreen> createState() => _PairingScreenState();
}

class _PairingScreenState extends State<PairingScreen> {
  final _controller = TextEditingController();
  final _focus = FocusNode();
  bool _busy = false;
  String? _error;

  String get _code => _controller.text;
  bool get _complete => _code.length == _codeLength;

  @override
  void initState() {
    super.initState();
    // Raise the keyboard on arrival: this screen has exactly one thing to
    // do, and making the technician tap a field first is a step for nothing.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focus.requestFocus();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _onChanged(String raw) {
    // The platform keyboard offers lowercase, O, I and L — none of which the
    // codes use. Fold and filter here rather than refusing input, so typing
    // a lowercase "o" is not a dead key the operator has to puzzle over.
    final cleaned = raw
        .toUpperCase()
        .split('')
        .where(_alphabet.contains)
        .take(_codeLength)
        .join();

    if (cleaned != raw) {
      _controller.value = TextEditingValue(
        text: cleaned,
        selection: TextSelection.collapsed(offset: cleaned.length),
      );
    }
    setState(() => _error = null);

    // Submit on the sixth character rather than making them find a button
    // after the task is already finished.
    if (cleaned.length == _codeLength) {
      HapticFeedback.selectionClick();
      _submit();
    }
  }

  Future<void> _submit() async {
    if (_busy || !_complete) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await widget.pair(
        baseUrl: widget.baseUrl,
        code: _code,
        deviceName: 'Tablet booth',
        appVersion: widget.appVersion,
      );
      if (!mounted) return;
      widget.onPaired(result);
    } on BoothApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.message;
        // Clearing is deliberate: every failure here means the six
        // characters are wrong, expired or spent. Leaving them on screen
        // invites the operator to retype around the same dead code.
        _controller.clear();
      });
      _focus.requestFocus();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'Gagal menghubungkan. Coba lagi.';
        _controller.clear();
      });
      _focus.requestFocus();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BoothSurface.base,
      body: Stack(
        children: [
          const Positioned.fill(
            child: DriftingBlobs(colors: BoothSurface.ambient),
          ),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(
                  horizontal: 32,
                  vertical: 24,
                ),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 560),
                  child: FadeInUp(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _header(),
                        const SizedBox(height: 28),
                        _slots(),
                        SizedBox(height: _error == null ? 20 : 12),
                        if (_error != null) _errorLine(),
                        const SizedBox(height: 20),
                        _keypad(),
                        const SizedBox(height: 20),
                        Text(
                          widget.hint ??
                              'Kode dibuat dari dashboard SellOn: '
                                  'Photo Booth → Hubungkan perangkat.',
                          textAlign: TextAlign.center,
                          style: SellonText.label.copyWith(
                            color: widget.hint == null
                                ? BoothSurface.textMuted
                                : BoothSurface.accent,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _header() {
    final previous = widget.previousBooth;
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: BoothSurface.accentSoft,
            shape: BoxShape.circle,
          ),
          child: const Icon(
            Icons.tablet_android_rounded,
            size: 34,
            color: BoothSurface.accent,
          ),
        ),
        const SizedBox(height: 18),
        Text(
          'Hubungkan ke booth',
          style: SellonText.h1.copyWith(color: BoothSurface.textPrimary),
        ),
        const SizedBox(height: 8),
        Text(
          previous == null
              ? 'Masukkan kode enam huruf dari dashboard untuk '
                    'mengaktifkan tablet ini.'
              : 'Tablet ini tidak lagi terhubung ke booth '
                    '${previous.code}. Masukkan kode baru untuk '
                    'menghubungkannya kembali.',
          textAlign: TextAlign.center,
          style: SellonText.body.copyWith(color: BoothSurface.textSecondary),
        ),
      ],
    );
  }

  /// Six slots rather than a text field: the operator can see at a glance how
  /// many characters are left, and there is no cursor, no selection, and no
  /// soft keyboard to fight.
  ///
  /// The boxes are display only — the real input is a zero-size TextField
  /// behind them, so the platform keyboard does the typing while the screen
  /// still shows six slots filling up. Tapping anywhere here raises it.
  Widget _slots() {
    return GestureDetector(
      onTap: () => _focus.requestFocus(),
      behavior: HitTestBehavior.opaque,
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox(
            width: 1,
            height: 1,
            child: TextField(
              controller: _controller,
              focusNode: _focus,
              onChanged: _onChanged,
              enabled: !_busy,
              autocorrect: false,
              enableSuggestions: false,
              textCapitalization: TextCapitalization.characters,
              // Visible characters, invisible field: a transparent cursor and
              // text keep the system selection handles from floating over the
              // slots.
              showCursor: false,
              cursorWidth: 0,
              style: const TextStyle(color: Colors.transparent, fontSize: 1),
              decoration: const InputDecoration(
                border: InputBorder.none,
                isDense: true,
                contentPadding: EdgeInsets.zero,
              ),
            ),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(_codeLength, (i) {
              final filled = i < _code.length;
              final next = i == _code.length && !_busy;
              return Container(
                width: 62,
                height: 76,
                margin: const EdgeInsets.symmetric(horizontal: 5),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: filled ? BoothSurface.card : BoothSurface.raised,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: next ? BoothSurface.accent : BoothSurface.border,
                    width: next ? 2 : 1,
                  ),
                ),
                child: Text(
                  filled ? _code[i] : '',
                  style: SellonText.h1.copyWith(
                    color: BoothSurface.textPrimary,
                  ),
                ),
              );
            }),
          ),
        ],
      ),
    );
  }

  Widget _errorLine() => Row(
    mainAxisAlignment: MainAxisAlignment.center,
    children: [
      const Icon(
        Icons.error_outline_rounded,
        size: 18,
        color: Color(0xFFF2726F),
      ),
      const SizedBox(width: 8),
      Flexible(
        child: Text(
          _error!,
          textAlign: TextAlign.center,
          style: SellonText.label.copyWith(color: const Color(0xFFF2726F)),
        ),
      ),
    ],
  );

  Widget _keypad() {
    if (_busy) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(
            width: 34,
            height: 34,
            child: CircularProgressIndicator(
              strokeWidth: 3,
              color: BoothSurface.accent,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Menghubungkan…',
            style: SellonText.body.copyWith(color: BoothSurface.textSecondary),
          ),
        ],
      );
    }
    return PillButton(
      label: 'Ketuk untuk mengetik',
      icon: Icons.keyboard_alt_outlined,
      variant: PillVariant.secondary,
      onPressed: () => _focus.requestFocus(),
    );
  }
}
