// extract filled rects + text placements from one PDF content stream (by stream index)
const fs = require('fs'), zlib = require('zlib');
const buf = fs.readFileSync(process.argv[2] || 'Doomed_to_Re_Annotate_compressed.pdf');
const want = parseInt(process.argv[3] || '118', 10);
const STREAM = Buffer.from('stream'), END = Buffer.from('endstream');
const streams = [];
let pos = 0;
for (;;) {
  let k = buf.indexOf(STREAM, pos);
  if (k < 0) break;
  let st = k + STREAM.length;
  if (buf[st] === 0x0d) st++;
  if (buf[st] === 0x0a) st++;
  const end = buf.indexOf(END, st);
  if (end < 0) break;
  pos = end + END.length;
  const raw = buf.subarray(st, end);
  let d = null;
  try { d = zlib.inflateSync(raw); } catch (e) { try { d = zlib.inflateRawSync(raw); } catch (e2) {} }
  streams.push(d);
}

const t = streams[want].toString('latin1');

// --- tokenizer ---
const tokRe = /\/[A-Za-z0-9._-]+|\[|\]|<[0-9A-Fa-f\s]*>|[-\d.]+|[A-Za-z'"*]+|\/.*/g;
let m, stack = [], tm = [1, 0, 0, 1, 0, 0], ctm = [1, 0, 0, 1, 0, 0], ctmStack = [], path = [], num = [], fill = null, strok = null, fontsize = 0, tmm = [1, 0, 0, 1, 0, 0], inText = false;
const rects = [], texts = [];
const mul = (a, b) => [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
const pt = (x, y) => { const p = mul([x, y, 0, 0, 1].slice(0, 2).concat([0,0,1]) && [1,0,0,1,0,0], [1,0,0,1,0,0]); return [ctm[0]*x+ctm[2]*y+ctm[4], ctm[1]*x+ctm[3]*y+ctm[5]]; };

function flushPath(op) {
  if (!path.length) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of path) { const [X, Y] = pt(x, y); x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); }
  if (op === 'fill' && (op.c !== undefined ? true : true)) rects.push({ x0, y0, x1, y1, c: fill });
  path = [];
}

const nums = () => { const a = num.slice(); num = []; return a; };
let inPath = false;
while ((m = tokRe.exec(t))) {
  const w = m[0];
  if (/^[-.\d]+$/.test(w)) { num.push(parseFloat(w)); continue; }
  if (w === 'q') { ctmStack.push(ctm.slice()); continue; }
  if (w === 'Q') { ctm = ctmStack.pop() || [1,0,0,1,0,0]; continue; }
  if (w === 'cm') { const a = nums(); ctm = mul(a, ctm); continue; }
  if (w === 're') { const [x, y, wd, ht] = nums(); const a = pt(x, y), b = pt(x + wd, y + ht); rects.push({ x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]), c: fill, re: 1 }); continue; }
  if (w === 'm') { nums(); inPath = 1; path = []; continue; }
  if (w === 'l') { const a = nums(); if (a.length === 2) path.push(a); continue; }
  if (w === 'h') { continue; }
  if (w === 'W' || w === 'W*') { nums(); continue; }
  if (w === 'f' || w === 'f*' || w === 'B' || w === 'B*' || w === 'b' || w === 'S' || w === 's') { if (inPath) flushPath('fill'); inPath = 0; continue; }
  if (w === 'n') { path = []; inPath = 0; continue; }
  if (w === 'rg') { const a = nums(); fill = a.map((v) => Math.round(v * 255)); continue; }
  if (w === 'g') { const a = nums(); fill = [a[0] * 255, a[0] * 255, a[0] * 255].map(Math.round); continue; }
  if (w === 'G') { nums(); continue; }
  if (w === 'RG' || w === 'K' || w === 'k' || w === 'SC' || w === 'sc' || w === 'SCN' || w === 'scn' || w === 'CS' || w === 'cs') { nums(); continue; }
  if (w === 'd0' || w === 'd1') { nums(); continue; }
  if (w === 'gs' || w === 'ri' || w === 'i' || w === 'j' || w === 'J' || w === 'M' || w === 'd' || w === 'y') { nums(); continue; }
  if (w === 'sh') { nums(); continue; }
  if (w === 'BT') { inText = 1; tmm = [1, 0, 0, 1, 0, 0]; continue; }
  if (w === 'Tm') { const a = nums(); tmm = mul(a, [1,0,0,1,0,0]); continue; }
  if (w === 'Td' || w === 'TD') { const a = nums(); const ty = w === 'TD' ? -a[1] : a[1]; tmm = mul([1, 0, 0, 1, a[0], ty], tmm); continue; }
  if (w === 'Tf') { nums(); continue; }
  if (w === 'TJ' || w === 'Tj' || w === "'" || w === '"') {
    // grab preceding string(s)
    let str = '';
    const s2 = t.slice(Math.max(0, m.index - 400), m.index);
    const tm2 = [...s2.matchAll(/\(((?:\\.|[^\\()])*)\)|<([0-9A-Fa-f\s]+)>/g)].slice(-3);
    str = tm2.map((x) => (x[1] !== undefined ? x[1] : x[2])).join('');
    if (str.startsWith('(') || str.startsWith('<')) str = str.slice(1);
    const p = pt(tmm[4], tmm[5]);
    const dev = [ctm[0] * tmm[4] + ctm[2] * tmm[5] + ctm[4], ctm[1] * tmm[4] + ctm[3] * tmm[5] + ctm[5]];
    texts.push({ x: dev[0], y: dev[1], s: str });
    continue;
  }
  if (w === 'ET') { inText = 0; continue; }
  if (w.startsWith('Do')) { nums(); continue; }
  nums();
}

// report
const by = {};
for (const r of rects) { const k = (r.c || []).join(','); by[k] = (by[k] || 0) + 1; }
console.log('rects', rects.length, 'colors', JSON.stringify(by));
rects.sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0);
for (const r of rects.slice(0, 130)) console.log(r.x0.toFixed(1), r.y0.toFixed(1), r.x1.toFixed(1), r.y1.toFixed(1), 'c=' + (r.c || []).join(','), r.re ? 'RE' : 'path');
console.log('--- texts', texts.length);
for (const tx of texts.slice(0, 120)) console.log(tx.x.toFixed(1), tx.y.toFixed(1), JSON.stringify(tx.s));
