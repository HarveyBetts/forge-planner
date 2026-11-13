// Apple-style bottom sheet (DESIGN.md): mounted on <body> (never inside a transformed screen), grip drawn by
// CSS ::before so re-rendering the content can't remove it, drag-to-dismiss from the grip zone or whenever the
// content is scrolled to the top, Escape / backdrop tap to close, slide transitions with the motion tokens.
let current = null;

export function openSheet({ html, label = 'Sheet', onClick, onInput, onClose }) {
  closeSheet(true);
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-back" data-sheet-close></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-label="${label.replace(/"/g, '&quot;')}"><div class="sheet-body">${html}</div></section>`;
  document.body.appendChild(wrap);
  document.body.classList.add('sheet-open');
  const sheet = wrap.querySelector('.sheet');
  const body = wrap.querySelector('.sheet-body');
  const reduce = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
  void sheet.offsetWidth; // flush so the entrance transition runs (iOS skips same-frame changes)
  wrap.classList.add('in');

  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-sheet-close]')) { e.preventDefault(); closeSheet(); return; }
    if (onClick) onClick(e);
  });
  if (onInput) { wrap.addEventListener('input', onInput); wrap.addEventListener('change', onInput); }
  const onKey = (e) => { if (e.key === 'Escape') closeSheet(); };
  document.addEventListener('keydown', onKey);

  // Drag to dismiss.
  let startY = null, dy = 0;
  const down = (e) => {
    const r = sheet.getBoundingClientRect();
    const inGrip = e.clientY - r.top < 36;
    if (!inGrip && body.scrollTop > 2) return;
    if (e.target.closest('input, select, textarea, button, a, label')) return;
    startY = e.clientY; dy = 0; sheet.style.transition = 'none';
  };
  const move = (e) => {
    if (startY == null) return;
    dy = Math.max(0, e.clientY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
  };
  const up = () => {
    if (startY == null) return;
    startY = null;
    sheet.style.transition = '';
    if (dy > 110) closeSheet(); else sheet.style.transform = '';
  };
  sheet.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);

  current = { wrap, sheet, body, onClose, cleanup: () => {
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
  }, reduce };
  const first = sheet.querySelector('input, select, button:not([data-sheet-close])');
  if (first && matchMedia('(hover: hover)').matches) first.focus({ preventScroll: true });
  return current;
}

export function sheetBody() { return current ? current.body : null; }
export function setSheetHTML(html) { if (current) current.body.innerHTML = html; }

export function closeSheet(immediate = false) {
  if (!current) return;
  const { wrap, sheet, cleanup, onClose, reduce } = current;
  current = null;
  cleanup();
  document.body.classList.remove('sheet-open');
  const done = () => wrap.remove();
  if (immediate || reduce) done();
  else {
    sheet.style.transform = '';
    wrap.classList.remove('in');
    setTimeout(done, 320);
  }
  if (onClose) onClose();
}
export function isSheetOpen() { return !!current; }

// Small toast on <body> for "Saved" style confirmations.
export function toast(text, ms = 2600) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = text;
  document.body.appendChild(t);
  void t.offsetWidth;
  t.classList.add('in');
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, ms);
}
