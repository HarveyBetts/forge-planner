// Builds a small .xlsx in memory with the SAME LAYOUT as Harvey's budget workbook but made-up names and numbers
// (no personal data in git). Used by unit tests and the e2e import test. Pure Node (zlib for deflate).
import { deflateRawSync } from 'node:zlib';

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

export function zip(files) {
  const enc = new TextEncoder();
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameB = enc.encode(name), raw = enc.encode(text), data = deflateRawSync(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc32(raw), 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nameB.length, 26);
    locals.push(lh, nameB, data);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc32(raw), 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nameB.length, 28); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameB);
    offset += 30 + nameB.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(Object.keys(files).length, 8); eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// cells: { A1: value } ; strings go to sharedStrings except those prefixed with "inline:" or "str:" (formula cached string)
function sheetXml(cells, shared) {
  const byRow = {};
  for (const [ref, v] of Object.entries(cells)) { const r = Number(ref.match(/\d+/)[0]); (byRow[r] ||= []).push([ref, v]); }
  const rows = Object.keys(byRow).map(Number).sort((a, b) => a - b).map((r) => `<row r="${r}">${byRow[r].map(([ref, v]) => {
    if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
    if (String(v).startsWith('inline:')) return `<c r="${ref}" t="inlineStr"><is><t>${esc(String(v).slice(7))}</t></is></c>`;
    if (String(v).startsWith('str:')) return `<c r="${ref}" t="str"><f>SOMEFORMULA()</f><v>${esc(String(v).slice(4))}</v></c>`;
    let i = shared.indexOf(v); if (i < 0) { shared.push(v); i = shared.length - 1; }
    return `<c r="${ref}" t="s"><v>${i}</v></c>`;
  }).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
}

export function workbook(sheets) {
  const shared = [];
  const sheetFiles = {};
  sheets.forEach((s, i) => { sheetFiles[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s.cells, shared); });
  const files = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'xl/workbook.xml': `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`,
    ...sheetFiles,
  };
  files['xl/sharedStrings.xml'] = `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared.map((s) => `<si><t>${esc(s)}</t></si>`).join('')}</sst>`;
  return zip(files);
}

// Made-up budget in Harvey's layout: 8 weeks from Mon 2 Nov 2026, pay 2 weeks late, 3 bills, premium bonds, 3 lots.
export function sampleBudgetWorkbook() {
  const B = { B2: 'Current', B3: 5000, B4: 'PREMIUM BONDS TOTAL', B5: 2000, D2: 'INVESTMENTS', D3: 1700, J3: 'MY FINANCES',
    T3: 'Phone', U3: 'inline:14th', T4: 'Loan', U4: '6th', T5: 'Electricity', U5: '4th May',
    B12: 'DATE', C12: 'INCOME', D12: 'RENT', E12: 'FOOD', F12: 'GYM', G12: 'REFUNDS', H12: 'TOTAL' };
  const labels = ['02/11 - 08/11', '09/11 - 15/11', '16/11 - 22/11', '23/11 - 29/11', '30/11 - 06/12', '07/12 - 13/12', '14/12 - 20/12', '21/12 - 27/12'];
  labels.forEach((lab, i) => {
    const r = 13 + i;
    B['B' + r] = lab; B['C' + r] = 1000 + 10 * i; B['D' + r] = -450; B['E' + r] = -(120 + i);
    if (i % 2 === 0) B['F' + r] = -20;
    if (i === 3) B['G' + r] = 35;
    B['H' + r] = 'str:formula total';
  });
  B.B21 = 'TOTAL'; B.B23 = 'At End'; B.E23 = 'AUD'; B.F23 = 'GBP';
  const I = { B2: 'TICKER', C2: 'FILLED QTY', D2: 'AMOUNT', E2: 'COST (£)', F2: 'SHARES', I2: 'TICKER', J2: 'COMPANY', K2: 'SHARES', O2: 'CURRENCY', P2: 'LIVE PRICE', Q2: 'VALUE (£)',
    B3: 'VWRL', C3: '10⁠.⁠5', D3: '£90.00', E3: 945,
    B4: 'AAPL', C4: '2', D4: '$150', E4: 240,
    B5: 'VWRL', C5: '5', D5: 95, E5: 475,
    I3: 'str:VWRL', J3: 'str:Vanguard FTSE All-World', O3: 'str:GBP', P3: 100,
    I4: 'str:AAPL', J4: 'str:Apple Inc', O4: 'str:USD', P4: 200 };
  return workbook([{ name: 'BUDGET', cells: B }, { name: 'INVESTMENTS', cells: I }]);
}
