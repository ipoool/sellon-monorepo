import 'dart:io';

/// Where photos come from.
///
/// This interface exists because the camera is the riskiest part of the
/// build: USB webcam (UVC) support on Android comes only from small,
/// single-maintainer packages, and the official `camera` plugin cannot drive
/// a USB webcam at all — Android does not expose LENS_FACING_EXTERNAL for
/// UVC devices. Keeping every call behind one interface means swapping the
/// implementation, or writing our own platform channel, is a one-file change
/// instead of a rewrite.
///
/// It is also what lets the whole UI be built and tested before any hardware
/// arrives: see FakeCameraSource.
abstract class CameraSource {
  /// Whether a camera is physically present and streaming. The idle screen
  /// watches this so an operator sees "kamera tidak terdeteksi" instead of a
  /// customer paying into a booth that cannot take a photo.
  Stream<bool> get availability;

  bool get isAvailable;

  /// Open the device. Safe to call repeatedly; a replugged webcam recovers
  /// through here.
  Future<void> open();

  Future<void> close();

  /// Capture one still to a file on disk.
  ///
  /// Returning a File rather than bytes is deliberate: a shot must survive
  /// the app being killed mid-session, so it is flushed to storage the moment
  /// it is taken and never held only in memory.
  Future<File> capture(String destinationPath);
}
