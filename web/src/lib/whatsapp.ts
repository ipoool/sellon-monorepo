// Strip non-digits and ensure leading 62 (Indonesia country code).
function normalizeWANumber(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  return "62" + digits;
}

// Build a wa.me URL with pre-filled message.
export function waLink(phone: string, message: string): string {
  const num = normalizeWANumber(phone);
  if (!num) return "";
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}

// Replace {{placeholders}} (with optional inner spaces) with values. Also
// still handles legacy single-brace {placeholder} for templates saved before
// the switch to double braces. Unknown keys are left as-is.
export function fillTemplate(
  template: string,
  vars: Record<string, string | number>,
): string {
  const sub = (m: string, key: string) =>
    key in vars ? String(vars[key]) : m;
  return template
    .replace(/\{\{\s*(\w+)\s*\}\}/g, sub) // {{ var }}
    .replace(/\{(\w+)\}/g, sub); // legacy {var}
}
