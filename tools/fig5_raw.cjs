// dump raw content stream text of a figure PDF stream
const fs = require('fs'), zlib = require('zlib');
const buf = fs.readFileSync(process.argv[2]);
const STREAM = Buffer.from('stream'), END = Buffer.from('endstream');
let pos = 0, i = 0;
for (;;) {
  let k = buf.indexOf(STREAM, pos);
  if (k < 0) break;
  let st = k + STREAM.length;
  if (buf[st] === 0x0d) st++;
  if (buf[st] === 0x0a) st++;
  const end = buf.indexOf(END, st);
  if (end < 0) break;
  pos = end + END.length;
  let d = null;
  try { d = zlib.inflateSync(buf.subarray(st, end)); } catch (e) { d = buf.subarray(st, end); }
  if (d && (d.toString('latin1').match(/\bf\b/g) || []).length > 20) {
    console.log('=== stream', i, 'len', d.length);
    console.log(d.toString('latin1'));
    break;
  }
  i++;
}
