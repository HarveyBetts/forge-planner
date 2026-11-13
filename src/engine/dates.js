// Month-index helpers shared by the engine modules. 'YYYY-MM' or 'YYYY-MM-DD' -> integer month index.
export function ym(dateStr) {
  const parts = String(dateStr).split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    throw new RangeError('Bad date: ' + dateStr);
  }
  return y * 12 + (m - 1);
}
export function fromYm(i) {
  const y = Math.floor(i / 12);
  const m = (i % 12) + 1;
  return y + '-' + String(m).padStart(2, '0');
}
