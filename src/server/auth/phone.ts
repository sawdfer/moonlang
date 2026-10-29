// Pure helper shared by server and client code (no "server-only").

/**
 * Normalizes a phone number to E.164, which is how it is stored and used to sign in.
 * Numbers without a country code are taken as Brazilian (DDD + number).
 * Returns null when the input cannot be a valid phone number.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  const national = digits.replace(/^0+/, "");
  // Brazilian numbers: 2-digit DDD + 8 (landline) or 9 (mobile) digits.
  if (national.length === 10 || national.length === 11) return `+55${national}`;
  if ((national.length === 12 || national.length === 13) && national.startsWith("55")) {
    return `+${national}`;
  }
  return null;
}
