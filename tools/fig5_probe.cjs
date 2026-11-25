// probe: inflate PDF streams, report which contain Figure-5 text / many rect draws
const fs = require('fs'), zlib = require('zlib');
const buf = fs.readFileSync(process.argv[2] || 'Doomed_to_Re_Annotate_compressed.pdf');
const STREAM = Buffer.from('stream'), END = Buffer.from('endstream');
let pos = 0, i = 0;
for (;;) {
  let k = buf.indexOf(STREAM, pos);
  if (k < 0) break;
  let st = k + STREAM.length;
  if (buf[st] === 0x0d) st++;
  if (buf[st] === 0x0a) st++;
  const end = buf.indexOf(END, st);
  if (end < 0) { console.log('no endstream after', k); break; }
  pos = end + END.length;
  const raw = buf.subarray(st, end);
  let d = null;
  try { d = zlib.inflateSync(raw); } catch (e) { try { d = zlib.inflateRawSync(raw); } catch (e2) {} }
  if (d) {
    const t = d.toString('latin1');
    const hits = ['Figure 5', 'Distributions of the number', 'Labels mean', 'BBoxes mean', 'Figure 4:', 'Figure 6:', 'Figure 3:']
      .filter((x) => t.includes(x));
    const rects = (t.match(/\bre\b/g) || []).length;
    const fills = (t.match(/\b(f|f\*)\b/g) || []).length;
    if (hits.length || rects > 25) console.log('stream', i, 'bytes', d.length, 're:', rects, 'fills:', fills, hits.length ? 'HITS: ' + hits.join('|') : '');
  }
  i++;
  if (i > 20000) break;
}
console.log('scanned', i, 'streams');
