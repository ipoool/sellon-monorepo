import 'dart:async';
import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/widgets.dart';

import 'camera_source.dart';

/// The tablet's own camera, via the first-party `camera` plugin.
///
/// This is the implementation a booth runs on today. It is explicitly NOT
/// the USB webcam path: Android does not expose LENS_FACING_EXTERNAL for UVC
/// devices, so `availableCameras()` will never list one. An external webcam
/// needs its own CameraSource — which is the whole reason that interface
/// exists.
///
/// Front camera by default: a photo booth points at the person using it.
class DeviceCameraSource implements CameraSource {
  DeviceCameraSource({this.preferFront = true});

  final bool preferFront;

  CameraController? _controller;
  final _availability = StreamController<bool>.broadcast();

  @override
  Stream<bool> get availability => _availability.stream;

  @override
  bool get isAvailable => _controller?.value.isInitialized ?? false;

  @override
  Future<void> open() async {
    if (isAvailable) return;
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        _availability.add(false);
        return;
      }
      final pick = cameras.firstWhere(
        (c) =>
            c.lensDirection ==
            (preferFront
                ? CameraLensDirection.front
                : CameraLensDirection.back),
        orElse: () => cameras.first,
      );

      final controller = CameraController(
        pick,
        // High, not max: a booth strip is four small cells on receipt paper
        // or a 1080px soft copy, and max resolution costs capture latency
        // the customer feels as a laggy shutter.
        ResolutionPreset.high,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );
      await controller.initialize();
      _controller = controller;
      _availability.add(true);
    } catch (e) {
      debugPrint('camera open failed: $e');
      _controller = null;
      _availability.add(false);
    }
  }

  @override
  Future<void> close() async {
    final c = _controller;
    _controller = null;
    _availability.add(false);
    await c?.dispose();
  }

  @override
  Widget? buildPreview({bool mirror = true}) {
    final c = _controller;
    if (c == null || !c.value.isInitialized) return null;

    // Cover, not contain: the stage is full-bleed and letterboxing a face
    // inside grey bars looks like the booth is broken. The preview is framing
    // guidance — the captured still is its own aspect ratio regardless.
    Widget preview = FittedBox(
      fit: BoxFit.cover,
      child: SizedBox(
        width: c.value.previewSize?.height ?? 720,
        height: c.value.previewSize?.width ?? 1280,
        child: CameraPreview(c),
      ),
    );
    if (mirror) {
      preview = Transform.flip(flipX: true, child: preview);
    }
    return preview;
  }

  @override
  Future<File> capture(String destinationPath) async {
    final c = _controller;
    if (c == null || !c.value.isInitialized) {
      throw StateError('kamera belum siap');
    }
    final shot = await c.takePicture();
    final dest = File(destinationPath);
    await dest.parent.create(recursive: true);
    // Move rather than copy: the plugin writes to a cache directory the OS
    // may clear, and a paid-for shot must live where the session expects it.
    await shot.saveTo(dest.path);
    try {
      await File(shot.path).delete();
    } catch (_) {
      // The temp file is the OS's problem if it will not go.
    }
    return dest;
  }
}
