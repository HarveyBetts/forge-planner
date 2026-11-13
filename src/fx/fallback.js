// Offline approximate FX — a stop-gap until T1.1 ports the live FX engine from legacy Forge.
// Rates are units per 1 USD, copied from legacy Forge's FX_FALLBACK table. Mid-market, approximate:
// the UI must label converted totals "approx".
export const FX_FALLBACK = { USD: 1, GBP: 0.79, AUD: 1.52 };

export function convertApprox(amount, from, to, rates = FX_FALLBACK) {
  if (from === to) return amount;
  const rf = rates[from];
  const rt = rates[to];
  if (!rf || !rt) throw new Error(`No rate for ${from} or ${to}`);
  return (amount / rf) * rt;
}
