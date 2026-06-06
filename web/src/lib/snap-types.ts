// Ambient typing for the Midtrans Snap.js global, injected on demand by
// load-snap.ts. Import this module for its side effect to get window.snap typed.
export {};

type SnapResult = Record<string, unknown>;

declare global {
  interface Window {
    snap?: {
      pay: (
        token: string,
        callbacks?: {
          onSuccess?: (result: SnapResult) => void;
          onPending?: (result: SnapResult) => void;
          onError?: (result: SnapResult) => void;
          onClose?: () => void;
        },
      ) => void;
    };
  }
}
