// Pure helpers to read billing forms. Amounts are typed in reais ("85", "85,50", "1.234,50").

/** Parses an amount in reais into integer cents, or null when it is not a valid amount. */
export function parseReaisToCents(input: string): number | null {
  const text = input.trim().replace(/^R\$\s*/, "");
  if (!/^\d{1,3}(\.?\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(text)) return null;
  // A comma is the decimal separator and dots group thousands ("1.234"),
  // but "84.5" with 1–2 decimals is also accepted as a decimal point.
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : /\.\d{1,2}$/.test(text)
      ? text
      : text.replace(/\./g, "");
  const cents = Math.round(Number(normalized) * 100);
  return Number.isFinite(cents) ? cents : null;
}

/** "5, 10 15" → [5, 10, 15] (validation happens in the settings schema). */
export function parseDayList(input: string): number[] {
  return input
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(Number);
}
