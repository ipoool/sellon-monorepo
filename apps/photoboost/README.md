# PhotoBoost

Photo booth for Android tablets. A customer pays by QRIS, takes four shots,
picks a frame, and the strip is printed.

Part of the SellOn monorepo. This is a **platform-owned business**, not a
seller feature: it charges through the platform's own Midtrans account and its
transactions appear in the admin area, not in any seller's dashboard.

## Status

Built and tested:

- the full money path in the API (`api/internal/repository/photobooth*.go`,
  `api/internal/payments/qris.go`) with concurrency tests
- the seven device endpoints and the device-token auth realm
- SellOn theme ported to Dart, the state-machine types, the camera and
  printer abstractions, and the thermal raster pipeline

Not built yet: the Bluetooth transport and the real UVC camera. See the plan
for the milestone order.

## What the booth sells today

Rp 5.000, four shots, one strip on thermal receipt paper. The price and the
shot count come from the server (`photobooth_settings`, editable per booth)
— the tablet never decides either.

**Frames, stickers and filters are off** (`lib/features/feature_flags.dart`,
`kDecorationsEnabled = false`). The code is all still here and the server
still carries a frames list; the screens just skip the choice. Two reasons:
the output is 1-bit dithered monochrome, so a filter chosen on a bright
screen mostly vanishes on the paper, and it cost a paying customer a
decision they could not judge until it was already printed.

The confirm screen stays, without the chips. It is the only place anyone
sees the strip before it is committed to paper they have paid for.

Turning the feature back on when a dye-sublimation printer arrives is one
constant plus whatever frames an admin uploads.

## Running it

```bash
flutter pub get
flutter run          # a tablet or a tablet-sized emulator, landscape
flutter test
flutter analyze
```

### Seeing what will actually print

The hardest thing to judge from a mockup is whether a photograph survives
being reduced to one bit per dot on receipt paper. This renders it:

```bash
flutter test test/print_preview_test.dart
open build/print-preview/
```

You get the colour composite and the dithered 1-bit version at both paper
widths, plus the black coverage and how much paper a strip eats:

| Paper | Dots | Strip length | Each shot |
|---|---|---|---|
| 58 mm | 384 | ~144 mm | ~48 × 36 mm |
| 80 mm | 576 | ~216 mm | ~72 × 54 mm |

58 mm shots come out roughly postage-stamp sized. **Buy 80 mm printers** unless
there is a reason not to; the code is width-parameterised either way.

## Hardware notes, learned the expensive way

**USB webcam (UVC) is the project's biggest risk.** Android does not expose
`LENS_FACING_EXTERNAL` for UVC devices, so the official `camera` plugin cannot
drive a USB webcam at all. The alternatives are small, single-maintainer
packages (`flutter_ffi_uvc` is the healthiest; `flutter_uvc_camera` wants
`targetSdk 27`, which breaks kiosk mode). Everything goes through
`CameraSource` so the implementation is a one-file swap — and `FakeCameraSource`
means the whole app can be built and tested before the hardware question is
settled.

**One USB-C port.** Webcam plus all-day charging needs a powered OTG hub with
PD passthrough. Budget for it, and prefer a *Bluetooth* printer so a third
device does not fight for the bus.

**Thermal heads are current-limited** (typically 64 of 384 dots at once). Dense
black prints slowly, comes out grey, and can trip the thermal cutout. So:
frames and stickers must be line art, never solid fills, and the raster
pipeline lifts gamma to land near 35–45% coverage. The preview test asserts
the strip stays under 55%.

## Kiosk provisioning

Lock task needs device-owner, which needs a factory-fresh tablet:

```bash
adb install build/app/outputs/flutter-apk/app-release.apk
adb shell dpm set-device-owner id.sellon.photoboost/.AdminReceiver
```

Do this **before** anyone signs into a Google account on the device —
`set-device-owner` refuses once an account exists, and the only way back is a
factory reset.

The launcher activity is also registered as `CATEGORY_HOME`. That is the
cheapest crash recovery there is: if the process dies, Android relaunches the
home app, which is us, rather than dropping a customer onto the Android
launcher.

## Pairing a tablet to a booth

A fresh install knows nothing. It shows a six-key pad and waits.

1. Dashboard SellOn → **Photo Booth** → pick the booth → **Hubungkan
   perangkat**. A six-character code appears with a countdown.
2. On the tablet, type that code. It pairs and goes straight to idle.

The device token is 64 hex characters and never passes through a person: the
tablet trades the code for it over TLS and stores it itself. The code is
single-use and dies after 15 minutes, so the thing a human carries across the
floor is worthless by the time anyone could misuse it.

The alphabet has no `O`, `0`, `I`, `1` or `L`, because a code is read off one
screen and typed on another by someone standing up.

**Un-pairing** is "Cabut" on the device in the admin console. The next call
the tablet makes answers 401, it wipes its stored token, and it returns to the
keypad naming the booth it used to be — so a lost tablet stops selling the
moment someone says so, not at some expiry.

Which server a booth pairs against is compiled in, not typed at the booth:

```bash
flutter build apk --release \
  --dart-define=DEMO=false \
  --dart-define=API_BASE=https://sellon.id \
  --dart-define=APP_VERSION=0.1.0
```

An operator who could point a tablet at an arbitrary host is one phone call
away from pairing the fleet to someone else's server.

`--dart-define=DEMO=true` (the default off-device) skips pairing entirely and
runs the whole flow against fakes.

## Money rules this app must not break

The server owns payment truth; the tablet only reads `payment_status`. Beyond
that, one rule governs the state machine:

> Before `Paid`, any timeout may return to idle. **After `Paid`, no path
> returns to idle without either a successful print or a recorded failure plus
> a session code the customer can take to an operator.**

Timeouts on the decorate and preview screens therefore *advance* the flow
(default frame, auto-print) rather than cancelling it. The customer has
already paid; stranding them because they looked away is taking their money
for nothing.
