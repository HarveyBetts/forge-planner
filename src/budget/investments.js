// Investments — the model of Harvey's INVESTMENTS sheet (D23). PURE.
//   lots:   [{ ticker, shares, price, currency, costGBP, date? }]  one row per purchase (price in the share's currency)
//   prices: { [ticker]: { price, currency, name?, at? } }          last known price (from the import, or typed in)
// holdings() rolls lots up per ticker like the sheet's right-hand table; values in £ via the injected converter.

// "28⁠.⁠5193234" (with invisible word-joiners from a copy-paste) → 28.5193234
export function parseQty(x) {
  if (typeof x === 'number') return x;
  const n = Number(String(x ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && String(x ?? '').replace(/[^0-9]/g, '') !== '' ? n : null;
}
// "$12.85" → { amount: 12.85, currency: 'USD' };  "£1.20" GBP;  "€3" EUR;  "125p" / "125 GBX" GBX;  plain number → fallback
export function parsePrice(x, fallback = null) {
  if (typeof x === 'number') return { amount: x, currency: fallback };
  const s = String(x ?? '');
  const amount = parseQty(s);
  if (amount == null) return null;
  let currency = fallback;
  if (s.includes('$')) currency = 'USD';
  else if (s.includes('£')) currency = 'GBP';
  else if (s.includes('€')) currency = 'EUR';
  else if (/p\s*$|gbx/i.test(s)) currency = 'GBX';
  return { amount, currency };
}

// toGBP(amount, currency) is injected (src/fx in the app). GBX (pence) is handled here: 100 GBX = £1.
export function holdings(lots, prices = {}, toGBP = (a, c) => (c === 'GBP' ? a : NaN)) {
  const gbp = (a, c) => (c === 'GBX' ? a / 100 : c === 'GBP' ? a : toGBP(a, c));
  const by = new Map();
  for (const l of lots || []) {
    const t = String(l.ticker || '').trim().toUpperCase();
    if (!t || !(Number(l.shares) > 0)) continue;
    const h = by.get(t) || { ticker: t, shares: 0, cost: 0, localCost: 0, currency: l.currency || null };
    h.shares += Number(l.shares);
    h.cost += Number(l.costGBP) || 0;
    h.localCost += Number(l.shares) * (Number(l.price) || 0);
    if (!h.currency && l.currency) h.currency = l.currency;
    by.set(t, h);
  }
  const list = [...by.values()].map((h) => {
    const p = prices[h.ticker];
    const currency = (p && p.currency) || h.currency;
    const value = p && Number.isFinite(p.price) ? gbp(h.shares * p.price, currency) : null;
    const ok = Number.isFinite(value);
    return {
      ...h, currency, name: p && p.name || null,
      avgCost: h.cost / h.shares, avgBuyPrice: h.localCost / h.shares,
      price: p ? p.price : null, priceAt: p ? p.at || null : null,
      value: ok ? value : null, gain: ok ? value - h.cost : null, gainPct: ok && h.cost ? (value - h.cost) / h.cost : null,
    };
  });
  const priced = list.filter((h) => h.value != null);
  const totals = {
    cost: list.reduce((s, h) => s + h.cost, 0),
    value: priced.reduce((s, h) => s + h.value, 0),
    pricedCost: priced.reduce((s, h) => s + h.cost, 0),
    unpriced: list.filter((h) => h.value == null).map((h) => h.ticker),
  };
  totals.gain = totals.value - totals.pricedCost;
  totals.gainPct = totals.pricedCost ? totals.gain / totals.pricedCost : null;
  return { list, totals };
}
