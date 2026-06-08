/**
 * Shared Bulgarian phone-number helpers — single source of truth for every
 * lead form on the public site (Get In Touch, Consultation CTA, Contacts,
 * About-us, Catalog, etc.).
 *
 * Spec (matches the existing logic in /pages/public/AboutPage.js):
 *   • Accept input in any common shape — with or without the +359 / 359 /
 *     leading 0 prefix, with spaces, dashes, parentheses, etc.
 *   • Normalize to "subscriber digits" (no country code, no leading 0).
 *   • Validate as a Bulgarian number:
 *       – Mobile  : 9 digits, starts with 8 or 9   (e.g. 89X XXX XXX)
 *       – Landline: 8 digits, starts with 2-7      (e.g. 2 XXX XXXX = Sofia)
 *       – Landline 9-digit variants also accepted  (regional codes)
 *   • Format on screen as "XX XXX XXXX" (subscriber-only), max 9 digits.
 *   • For submission, return the canonical E.164 string "+359XXXXXXXXX".
 */

export function normalizeBgPhone(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("00359")) digits = digits.slice(5);
  if (digits.startsWith("359")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

export function isValidBgPhone(raw) {
  const d = normalizeBgPhone(raw);
  // Mobile: 9 digits starting with 8 or 9
  if (d.length === 9 && /^[89]/.test(d)) return true;
  // Landlines (8 digits regional, 9 digits for some regions)
  if (d.length === 8 && /^[2-7]/.test(d)) return true;
  if (d.length === 9 && /^[2-7]/.test(d)) return true;
  return false;
}

export function formatBgPhone(raw) {
  const d = normalizeBgPhone(raw).slice(0, 9);
  if (d.length === 0) return "";
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)} ${d.slice(2)}`;
  return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`;
}

/** Returns canonical E.164: "+359XXXXXXXXX" (or "" if input is empty). */
export function toE164Bg(raw) {
  const d = normalizeBgPhone(raw);
  return d ? `+359${d}` : "";
}
