// Display-side masking for emails and phone numbers shown inside audit-log
// entries (and anywhere else PII would leak to staff/admins who only need
// "who" + "what", not the exact contact). Storage stays untouched — these
// helpers run at render time only.

// Mask an email: "asep@gmail.com" → "asep*****@gmail.com".
// Local part: keep up to first 4 chars (1 char min for very short names);
// always append a 5-asterisk band; preserve the domain so the support
// channel stays recognizable.
export function maskEmail(email: string): string {
  if (!email) return email;
  const at = email.indexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const headLen = Math.min(4, Math.max(1, local.length - 1));
  const head = local.slice(0, headLen);
  return `${head}*****${domain}`;
}

// Mask an Indonesian-style phone number: "081234567890" →
// "0812*****890". Keeps first 4 + last 3 digits so the staff can still
// eyeball-match without seeing the full number. Falls back to the
// original string when too short to safely mask.
export function maskPhone(phone: string): string {
  if (!phone) return phone;
  // Normalize: keep leading + plus digits only for the matching length.
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.length < 8) return phone;
  const head = cleaned.slice(0, 4);
  const tail = cleaned.slice(-3);
  return `${head}*****${tail}`;
}

// Free-form text scrubber. Finds every email + phone-shaped substring and
// masks each in place. Used for fields like WhatsApp message bodies and
// audit-entry summaries that may embed contact info inline.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Indonesian mobile numbers: starts with +62 / 62 / 0, then 8, then 7-12
// more digits. Word boundary at the end so it doesn't grab parts of a
// longer numeric string (e.g. an order number).
const PHONE_RE = /(?:\+?62|0)8\d{7,12}\b/g;

export function maskPII(text: string): string {
  if (!text) return text;
  return text.replace(EMAIL_RE, (m) => maskEmail(m)).replace(
    PHONE_RE,
    (m) => maskPhone(m),
  );
}
