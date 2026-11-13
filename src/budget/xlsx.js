// Minimal .xlsx reader — no libraries (CLAUDE.md §4). Reads cell VALUES (incl. the cached results of formulas,
// e.g. Google Sheets' last live prices). Runs in the browser (DecompressionStream) or Node (inject zlib).
//   await readXlsx(arrayBufferOrUint8Array, { inflateRaw? }) -> { sheets: [{ name, cells: { 'B3': value } }] }
// value: number | string | boolean. Not supported (not needed): styles, dates as dates (they come back as serial numbers).

const td = new TextDecoder('utf-8');

// ---------- zip ----------
function u16(b, o) { return b[o] | (b[o + 1] << 8); }
function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

export function readZipDirectory(bytes) {
  // End of central directory: signature 0x06054b50, within the last 64 KiB + 22 bytes.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('That file isn’t a valid .xlsx (no zip directory found).');
  const count = u16(bytes, eocd + 10);
  let p = u32(bytes, eocd + 16);
  const files = new Map();
  for (let k = 0; k < count; k++) {
    if (u32(bytes, p) !== 0x02014b50) throw new Error('That .xlsx looks damaged (bad zip entry).');
    const method = u16(bytes, p + 10);
    const csize = u32(bytes, p + 20);
    const nameLen = u16(bytes, p + 28), extraLen = u16(bytes, p + 30), commentLen = u16(bytes, p + 32);
    const local = u32(bytes, p + 42);
    const name = td.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const lNameLen = u16(bytes, local + 26), lExtraLen = u16(bytes, local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    files.set(name, { method, data: bytes.subarray(start, start + csize) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

async function browserInflateRaw(data) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser can’t open .xlsx files. Update iOS / your browser, or export the sheets as CSV.');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ---------- tiny XML helpers (the files are machine-written and well-formed) ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export function xmlDecode(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e.toLowerCase()];
  });
}
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? xmlDecode(m[1]) : null; };
const texts = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => xmlDecode(m[1])).join('');

export function colToIndex(col) { let n = 0; for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
export function indexToCol(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

function parseSheet(xml, shared) {
  const cells = {};
  for (const m of xml.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = ' ' + m[1];
    const ref = attr(attrs, 'r');
    if (!ref) continue;
    const type = attr(attrs, 't');
    const inner = m[2] || '';
    const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
    let value = null;
    if (type === 's') value = vm ? shared[Number(vm[1])] ?? null : null;
    else if (type === 'inlineStr') value = texts(inner);
    else if (type === 'str' || type === 'e') value = vm ? xmlDecode(vm[1]) : null;
    else if (type === 'b') value = vm ? vm[1] === '1' : null;
    else if (vm) { const n = Number(vm[1]); value = Number.isFinite(n) ? n : xmlDecode(vm[1]); }
    if (value !== null && value !== '') cells[ref] = value;
  }
  return cells;
}

export async function readXlsx(input, { inflateRaw = browserInflateRaw } = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const files = readZipDirectory(bytes);
  const read = async (name) => {
    const f = files.get(name);
    if (!f) return null;
    const raw = f.method === 0 ? f.data : f.method === 8 ? await inflateRaw(f.data) : null;
    if (!raw) throw new Error(`Unsupported compression in ${name}.`);
    return td.decode(raw);
  };
  const wb = await read('xl/workbook.xml');
  if (!wb) throw new Error('That file isn’t an Excel workbook (.xlsx).');
  const rels = (await read('xl/_rels/workbook.xml.rels')) || '';
  const target = {};
  for (const m of rels.matchAll(/<Relationship\s([^>]*?)\/?>/g)) {
    const id = attr(' ' + m[1], 'Id'), t = attr(' ' + m[1], 'Target');
    if (id && t) target[id] = t.replace(/^\/?xl\//, '').replace(/^\//, '');
  }
  const ssXml = (await read('xl/sharedStrings.xml')) || '';
  const shared = [...ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
  const sheets = [];
  for (const m of wb.matchAll(/<sheet\s([^>]*?)\/?>/g)) {
    const a = ' ' + m[1];
    const name = attr(a, 'name');
    const rid = attr(a, 'r:id');
    const path = 'xl/' + (target[rid] || '');
    const xml = await read(path);
    if (xml) sheets.push({ name, cells: parseSheet(xml, shared) });
  }
  return { sheets };
}
