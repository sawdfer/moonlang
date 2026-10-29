// WhatsApp has no API here: the teacher sends ready-made texts via wa.me links (F-008, P7).

/**
 * Digits-only international number for wa.me, or null when the number is not a
 * valid mobile (then the message stays out of the queue, F-008).
 * Brazilian numbers without the country code get "55".
 */
export function normalizeWhatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (!trimmed.startsWith("+") && !digits.startsWith("55") && /^\d{10,11}$/.test(digits)) {
    digits = `55${digits}`;
  }
  if (digits.startsWith("55")) {
    // Brazil: 55 + 2-digit area code + 9-digit mobile starting with 9.
    return /^55[1-9]\d9\d{8}$/.test(digits) ? digits : null;
  }
  // Other countries: E.164 allows up to 15 digits.
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

/** https://wa.me/<digits>?text=<encoded> — opens the chat with the text filled in. */
export function waMeUrl(phone: string, text: string): string {
  const digits = normalizeWhatsAppNumber(phone);
  if (!digits) throw new Error("Invalid WhatsApp number");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
