/** All money is stored and computed as integer cents (BRL). */

/** Rounds a cents amount to the nearest whole real (RN-025: R$ 84,50 → R$ 85). */
export function roundToWholeReais(cents: number): number {
  return Math.round(cents / 100) * 100;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(cents: number): string {
  return brl.format(cents / 100);
}
