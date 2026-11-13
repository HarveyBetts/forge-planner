// Renders the answer control for one question, and reads the value back out of the DOM.
// String templates only; every user-provided value goes through esc().
import { optValue, optLabel, CURRENCIES } from './questions.js';
import { esc } from '../ui/format.js';

const PER = { mo: 'per month', yr: 'per year', wk: 'per week', once: '' };
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

function optionButtons(group, opts, selected, { multi = false } = {}) {
  const sel = multi ? new Set(selected || []) : new Set(selected != null ? [selected] : []);
  return `<div class="opts" role="${multi ? 'group' : 'radiogroup'}" data-group="${esc(group)}" data-multi="${multi ? 1 : 0}">` +
    opts.map((o) => {
      const val = optValue(o);
      const on = sel.has(val);
      return `<button type="button" class="opt" data-act="pick" data-val="${esc(val)}" ${multi ? `aria-pressed="${on}"` : `role="radio" aria-checked="${on}"`}>` +
        `<span class="opt-tick" aria-hidden="true"></span><span class="opt-l">${esc(optLabel(o))}</span></button>`;
    }).join('') + '</div>';
}

function moneyInput(prefix, def, val, base, label) {
  const fixed = def.currency;
  const cur = fixed || (val && val.currency) || base;
  const amt = val && isNum(val.amount) ? val.amount : '';
  const id = `in-${prefix}v`;
  const sym = (CURRENCIES.find((c) => c.v === cur) || CURRENCIES[0]).l;
  const toggle = fixed ? '' : `<div class="cur" role="radiogroup" aria-label="Currency" data-group="${esc(prefix)}cur">` +
    CURRENCIES.map((c) => `<button type="button" class="cur-b" data-act="cur" data-val="${c.v}" role="radio" aria-checked="${c.v === cur}">${c.l}</button>`).join('') +
    '</div>';
  return `<div class="field">${label ? `<label class="lab" for="${id}">${esc(label)}</label>` : ''}` +
    `<div class="money"><span class="money-sym" data-sym="${esc(prefix)}">${esc(sym)}</span>` +
    `<input id="${id}" class="in" name="${esc(prefix)}v" type="number" inputmode="decimal" min="0" step="any" value="${esc(amt)}" ${label ? '' : 'aria-label="Amount"'} placeholder="0">` +
    `${PER[def.per] ? `<span class="money-per">${PER[def.per]}</span>` : ''}</div>` +
    `<input type="hidden" name="${esc(prefix)}cur" value="${esc(cur)}">${toggle}</div>`;
}

function simpleInput(prefix, def, val, base, label) {
  const id = `in-${prefix}v`;
  const lab = label ? `<label class="lab" for="${id}">${esc(label)}</label>` : '';
  const aria = label ? '' : `aria-label="Your answer"`;
  switch (def.type) {
    case 'text':
      return `<div class="field">${lab}<input id="${id}" class="in" name="${esc(prefix)}v" type="text" value="${esc(val ?? '')}" ${aria} autocomplete="off"></div>`;
    case 'longtext':
      return `<div class="field">${lab}<textarea id="${id}" class="in" name="${esc(prefix)}v" rows="5" ${aria}>${esc(val ?? '')}</textarea></div>`;
    case 'number':
    case 'percent':
      return `<div class="field">${lab}<div class="num"><input id="${id}" class="in" name="${esc(prefix)}v" type="number" inputmode="decimal" step="any" ` +
        `${def.min != null ? `min="${def.min}"` : ''} ${def.max != null ? `max="${def.max}"` : ''} value="${esc(isNum(val) ? val : '')}" ${aria}>` +
        `${def.unit && !label ? `<span class="num-unit">${esc(def.unit)}</span>` : ''}${def.type === 'percent' && label ? '<span class="num-unit">%</span>' : ''}</div></div>`;
    case 'month':
      return `<div class="field">${lab}<input id="${id}" class="in" name="${esc(prefix)}v" type="month" placeholder="YYYY-MM" value="${esc(val ?? '')}" ${aria}></div>`;
    case 'money':
      return moneyInput(prefix, def, val, base, label);
    case 'choice':
      if (label) {
        return `<div class="field">${lab}<select id="${id}" class="in" name="${esc(prefix)}v"><option value="">Choose…</option>` +
          def.opts.map((o) => `<option value="${esc(optValue(o))}" ${optValue(o) === val ? 'selected' : ''}>${esc(optLabel(o))}</option>`).join('') +
          '</select></div>';
      }
      return optionButtons(prefix, def.opts, val);
    case 'multi':
      return optionButtons(prefix, def.opts, val, { multi: true });
    case 'scale':
      return `<div class="scale"><div class="opts scale-row" role="radiogroup" data-group="${esc(prefix)}" data-multi="0">` +
        [1, 2, 3, 4, 5].map((n) => `<button type="button" class="opt scale-b" data-act="pick" data-val="${n}" role="radio" aria-checked="${val === n}" aria-label="${n} of 5">${n}</button>`).join('') +
        `</div><div class="scale-l"><span>${esc(def.labels[0])}</span><span>${esc(def.labels[1])}</span></div></div>`;
    default:
      return '';
  }
}

export function renderInput(def, rec, base) {
  const val = rec && !rec.unknown ? rec.v : undefined;
  if (def.type === 'fields') {
    return `<div class="fields">${def.fields.map((f) => simpleInput(`${f.k}.`, f, val ? val[f.k] : undefined, base, f.label)).join('')}</div>`;
  }
  return simpleInput('', def, val, base, null);
}

// Read the current value. Returns undefined when the control is empty.
function readSimple(root, prefix, def) {
  const el = root.querySelector(`[name="${prefix}v"]`);
  switch (def.type) {
    case 'text':
    case 'longtext': {
      const s = el ? el.value.trim() : '';
      return s ? s : undefined;
    }
    case 'number':
    case 'percent': {
      if (!el || el.value.trim() === '') return undefined;
      const n = Number(el.value);
      return Number.isFinite(n) ? n : NaN;
    }
    case 'month': {
      const s = el ? el.value.trim() : '';
      return s ? s : undefined;
    }
    case 'money': {
      if (!el || el.value.trim() === '') return undefined;
      const cur = root.querySelector(`[name="${prefix}cur"]`);
      return { amount: Number(el.value), currency: cur ? cur.value : 'GBP' };
    }
    case 'choice': {
      if (el && el.tagName === 'SELECT') return el.value || undefined;
      const on = root.querySelector(`[data-group="${prefix}"] [aria-checked="true"]`);
      return on ? on.dataset.val : undefined;
    }
    case 'multi': {
      const on = [...root.querySelectorAll(`[data-group="${prefix}"] [aria-pressed="true"]`)].map((b) => b.dataset.val);
      return on.length ? on : undefined;
    }
    case 'scale': {
      const on = root.querySelector(`[data-group="${prefix}"] [aria-checked="true"]`);
      return on ? Number(on.dataset.val) : undefined;
    }
    default:
      return undefined;
  }
}

export function readInput(def, root) {
  if (def.type === 'fields') {
    const out = {};
    let any = false;
    for (const f of def.fields) {
      const x = readSimple(root, `${f.k}.`, f);
      if (x !== undefined) { out[f.k] = x; any = true; }
    }
    return any ? out : undefined;
  }
  return readSimple(root, '', def);
}
