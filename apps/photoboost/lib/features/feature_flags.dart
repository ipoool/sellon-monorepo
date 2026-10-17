/// Features switched off for the current booth configuration.
///
/// One constant rather than a scatter of commented-out widgets, so turning a
/// feature back on is a one-line change with a compiler to find every site.
library;

/// Frame and sticker choice, and photo filters.
///
/// Off while the booth prints to thermal receipt paper. Two reasons, and the
/// second is the real one:
///
///   - the output is 1-bit dithered monochrome, so a filter the customer
///     picks on a bright screen mostly disappears on the paper;
///   - it costs a paying customer a decision screen for something they
///     cannot judge until it has already been printed.
///
/// The code stays — `PhotoFilter`, `FrameStyle` and the chip widgets are
/// intact and the server still carries a frames list — so this flips back on
/// when the booth gets a dye-sublimation photo printer.
const bool kDecorationsEnabled = false;
