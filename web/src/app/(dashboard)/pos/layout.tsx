import type { ReactNode } from "react";

// Fullscreen POS layout — overrides the (dashboard) shell so no sidebar/topbar
// appears. Kasir mode needs all the screen real estate for the product grid +
// cart panel. Header is rendered per-page (POSHeader component) so it can react
// to session state.
//
// `select-none` di root supaya cashier yang tap-tap cepat di product grid
// tidak nge-highlight text product name secara tidak sengaja. Input field
// di dalam tetap selectable karena CSS user-select pakai `auto` di descendant
// input/textarea (via .select-text override di global utility).
export default function POSLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh bg-neutral-50 select-none [&_input]:select-text [&_textarea]:select-text">
      {children}
    </div>
  );
}
