// shortUA turns a raw User-Agent string into a compact "Browser · OS" label
// for the download-audit UI (e.g. "Chrome · Android"). Falls back to a trimmed
// raw string when it can't classify. Heuristic, display-only.
export function shortUA(ua: string): string {
  if (!ua) return "Perangkat tidak diketahui";

  const browser =
    /edg/i.test(ua) ? "Edge"
    : /opr|opera/i.test(ua) ? "Opera"
    : /chrome|crios/i.test(ua) ? "Chrome"
    : /firefox|fxios/i.test(ua) ? "Firefox"
    : /safari/i.test(ua) ? "Safari"
    : "";

  const os =
    /iphone|ipad|ipod/i.test(ua) ? "iOS"
    : /android/i.test(ua) ? "Android"
    : /windows/i.test(ua) ? "Windows"
    : /mac os|macintosh/i.test(ua) ? "macOS"
    : /linux/i.test(ua) ? "Linux"
    : "";

  if (browser && os) return `${browser} · ${os}`;
  if (browser) return browser;
  if (os) return os;
  return ua.length > 40 ? ua.slice(0, 40) + "…" : ua;
}
