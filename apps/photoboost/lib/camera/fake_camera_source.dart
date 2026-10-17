import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'camera_source.dart';

/// A camera that needs no camera.
///
/// This is not a toy: it is how every screen, timeout path and crash-resume
/// case gets built and tested while the real webcam question is still open.
/// It draws a numbered frame so a four-shot strip is visibly four different
/// photos rather than one image repeated.
class FakeCameraSource implements CameraSource {
  final _availability = StreamController<bool>.broadcast();
  bool _open = false;
  int _shot = 0;

  @override
  Stream<bool> get availability => _availability.stream;

  @override
  bool get isAvailable => _open;

  @override
  Future<void> open() async {
    await Future<void>.delayed(const Duration(milliseconds: 150));
    _open = true;
    _availability.add(true);
  }

  @override
  Future<void> close() async {
    _open = false;
    _availability.add(false);
  }

  /// No preview: CameraStage falls back to its dark placeholder, which is
  /// also what a booth with a dead camera shows. Tests and demo mode get the
  /// layout without a camera plugin in the way.
  @override
  Widget? buildPreview({bool mirror = true}) => null;

  @override
  Future<File> capture(String destinationPath) async {
    if (!_open) throw StateError('kamera belum dibuka');
    _shot++;
    final bytes = await _render(_shot);
    final f = File(destinationPath);
    await f.parent.create(recursive: true);
    await f.writeAsBytes(bytes, flush: true);
    return f;
  }

  Future<Uint8List> _render(int n) async {
    const w = 960.0, h = 720.0;
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder, const Rect.fromLTWH(0, 0, w, h));

    final hue = (n * 47) % 360;
    canvas.drawRect(
      const Rect.fromLTWH(0, 0, w, h),
      Paint()
        ..color = HSVColor.fromAHSV(1, hue.toDouble(), 0.18, 0.96).toColor(),
    );
    for (var i = 0; i < 12; i++) {
      canvas.drawCircle(
        Offset(
          math.Random(n * 100 + i).nextDouble() * w,
          math.Random(n * 200 + i).nextDouble() * h,
        ),
        24 + (i * 7) % 60,
        Paint()
          ..color = HSVColor.fromAHSV(
            0.25,
            (hue + i * 12) % 360,
            0.5,
            0.9,
          ).toColor(),
      );
    }
    final tp = TextPainter(
      text: TextSpan(
        text: '$n',
        style: const TextStyle(
          fontSize: 240,
          fontWeight: FontWeight.w700,
          color: Colors.white,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, Offset((w - tp.width) / 2, (h - tp.height) / 2));

    final img = await recorder.endRecording().toImage(w.toInt(), h.toInt());
    final data = await img.toByteData(format: ui.ImageByteFormat.png);
    return data!.buffer.asUint8List();
  }
}
