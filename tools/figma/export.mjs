#!/usr/bin/env node
// Export the rendered poster (dev server) to a Figma-importable SVG and verify it against the page.
//
//   node tools/figma/export.mjs [--url http://localhost:8443/] [--out figma-export] [--no-verify]
//                               [--tile 2500x2100] [--crops "x,y,w,h;..."] [--probe "<js expr>"]
//
// Output (in --out):
//   poster.svg        – drag into Figma: text = editable text layers, cards = vector shapes, photos embedded
//   reference.png     – the HTML page as rendered by Chrome (1/4 scale overview)
//   svg-render.png    – poster.svg rendered by Chrome (1/4 scale overview)
//   diff.png          – 1/4-scale mosaic of the FULL-RESOLUTION tile diffs (red = differs)
//   diff.json         – per-tile numbers; worst tiles are also saved as tile-<x>-<y>-{page,svg}.png
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const URL0 = opt('--url', 'http://localhost:8443/')
const OUT = path.resolve(ROOT, opt('--out', 'figma-export'))
const VERIFY = !args.includes('--no-verify')
const S = 0.25 // overview scale
const [TW, TH] = opt('--tile', '2500x2100').split('x').map(Number)
const CROPS = (opt('--crops', '') || '').split(';').filter(Boolean).map((c) => c.split(',').map(Number))
const PROBE = opt('--probe', '')
// Chrome binary: $CHROME, else the Playwright headless shell in ~/.cache/ms-playwright, else google-chrome/chromium on PATH
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME
  const pw = path.join(process.env.HOME || '', '.cache/ms-playwright')
  if (fs.existsSync(pw)) for (const d of fs.readdirSync(pw).filter((n) => n.startsWith('chromium')).sort().reverse()) {
    for (const rel of ['chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux/chrome', 'chrome-linux64/chrome']) { const p = path.join(pw, d, rel); if (fs.existsSync(p)) return p }
  }
  for (const n of ['google-chrome', 'chromium', 'chromium-browser']) for (const dir of (process.env.PATH || '').split(':')) { const p = path.join(dir, n); if (fs.existsSync(p)) return p }
  throw new Error('no Chrome found: set CHROME=/path/to/chrome (or: npx playwright install chromium-headless-shell)')
}
const CHROME = findChrome()
const PORT = 9300 + Math.floor(Math.random() * 500)
fs.mkdirSync(OUT, { recursive: true })
for (const f of fs.readdirSync(OUT)) if (/^(tile|crop)\S*\.png$/.test(f)) fs.unlinkSync(path.join(OUT, f))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------- headless Chrome + minimal CDP client ----------------
const chrome = spawn(CHROME, ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, '--window-size=1600,1000', '--force-color-profile=srgb', '--font-render-hinting=none', 'about:blank'], {
  // .tools/lib: locally extracted system libs for machines where Chrome's deps are not installed (optional)
  env: { ...process.env, ...(fs.existsSync(path.join(ROOT, '.tools/lib/usr/lib64')) ? { LD_LIBRARY_PATH: path.join(ROOT, '.tools/lib/usr/lib64') } : {}) },
  stdio: ['ignore', 'ignore', 'pipe'],
})
let chromeErr = ''
chrome.stderr.on('data', (d) => { chromeErr = (chromeErr + d).slice(-4000) })
const onChromeExit = (c) => { console.error('chrome exited', c, chromeErr); process.exit(1) }
chrome.on('exit', onChromeExit)
process.on('exit', () => chrome.kill('SIGKILL'))
setInterval(() => {}, 1000) // keep the event loop alive while waiting on CDP

// this headless shell has no NSS soft-token, so it cannot do TLS itself: every https request (Google Fonts)
// is paused and fetched by Node instead
const netCache = new Map()
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
async function netFetch(url) {
  if (!netCache.has(url)) {
    const r = await fetch(url, { headers: { 'user-agent': UA } })
    const drop = ['content-encoding', 'content-length', 'transfer-encoding', 'access-control-allow-origin']
    netCache.set(url, { status: r.status, headers: [...r.headers].filter(([k]) => !drop.includes(k)).map(([name, value]) => ({ name, value })).concat([{ name: 'access-control-allow-origin', value: '*' }]), body: Buffer.from(await r.arrayBuffer()).toString('base64') })
  }
  return netCache.get(url)
}

async function session(wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  ws.onclose = () => { if (!ws.closing) { console.error('cdp socket closed', chromeErr); process.exit(1) } }
  let seq = 0
  const pending = new Map()
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })) })
  ws.onmessage = async (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result) }
    else if (m.method === 'Fetch.requestPaused') {
      try { const c = await netFetch(m.params.request.url); await send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: c.status, responseHeaders: c.headers, body: c.body }) }
      catch (e) { console.error('proxy failed', m.params.request.url, e.message); await send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'Failed' }) }
    }
  }
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error('page error: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
    return r.result.value
  }
  const shot = async (clip) => Buffer.from((await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 }, fromSurface: true })).data, 'base64')
  const viewport = (width, height) => send('Emulation.setDeviceMetricsOverride', { width: Math.round(width), height: Math.round(height), deviceScaleFactor: 1, mobile: false })
  const goto = async (url) => { await send('Page.navigate', { url }); for (let k = 0; k < 600; k++) { await sleep(100); if ((await evaluate('document.readyState')) === 'complete') return } }
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] })
  await send('Page.enable')
  await send('Runtime.enable')
  return { send, evaluate, shot, viewport, goto, close: () => { ws.closing = true; ws.close() } }
}

let pageWs
for (let k = 0; k < 100 && !pageWs; k++) {
  await sleep(150)
  try { pageWs = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl } catch {}
}
if (!pageWs) throw new Error('chrome did not start')
const A = await session(pageWs) // the poster page

// ---------------- 1. load the poster ----------------
// viewport = scaled poster + the viewer's 32px margins -> the fit-to-screen scale becomes exactly S
// (extraction disables the scale and measures the 1:1 layout; the overview screenshot uses the scaled view)
const PW = 19876, PH = 12600
await A.viewport(PW * S + 64, PH * S + 64)
await A.goto(URL0)
await A.evaluate(`(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r }))); await new Promise(r => setTimeout(r, 800)); })()`)
const posterBox = () => A.evaluate(`(() => { const p = document.getElementById('poster'); const r = p.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: p.offsetWidth, h: p.offsetHeight, s: r.width / p.offsetWidth } })()`)
const dims = await posterBox()
if (Math.abs(dims.s - S) > 1e-6) throw new Error('poster not at scale ' + S + ': ' + JSON.stringify(dims))
if (VERIFY) fs.writeFileSync(path.join(OUT, 'reference.png'), await A.shot({ x: dims.x, y: dims.y, width: dims.w * S, height: dims.h * S }))
if (PROBE) console.log('probe(page):', JSON.stringify(await A.evaluate(PROBE)))

// ---------------- 2. extract ----------------
await A.evaluate(fs.readFileSync(path.join(ROOT, 'tools/figma/extract.js'), 'utf8'))
const X = await A.evaluate('window.__figmaExtract()')
console.log(`extracted ${X.nPrims} primitives from ${X.W}x${X.H}`)
console.log('font faces used:', JSON.stringify(X.faces))
if (X.rasterJobs.length) X.warn.push('unsupported CSS backgrounds left as empty images: ' + X.rasterJobs.map((j) => j.css).join(' | '))
if (X.warn.length) console.log('warnings:\n  ' + X.warn.join('\n  '))
let svg = X.svg

// ---------------- 3. embed images + inline svg assets ----------------
const assetFile = (src) => {
  const p = decodeURIComponent(new URL(src, URL0).pathname).replace(/^\/+/, '')
  for (const cand of [path.join(ROOT, 'public', p), path.join(ROOT, p)]) if (fs.existsSync(cand)) return cand
  throw new Error('asset not found: ' + src)
}
const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }
const imgCache = new Map()
svg = svg.replace(/<image href="([^"]+)"/g, (all, src) => {
  if (src.startsWith('data:')) return all
  src = src.replace(/&amp;/g, '&')
  if (!imgCache.has(src)) { const fpath = assetFile(src); imgCache.set(src, `data:${mime[path.extname(fpath).toLowerCase()]};base64,${fs.readFileSync(fpath).toString('base64')}`) }
  return `<image href="${imgCache.get(src)}"`
})
let svgN = 0
svg = svg.replace(/<svgasset src="([^"]+)" x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"(?: tint="([^"]+)" tint-opacity="([^"]+)")? aspect="none"\/>/g, (all, src, x, y, w, h, tint, tintOp) => {
  const t = fs.readFileSync(assetFile(src.replace(/&amp;/g, '&')), 'utf8').replace(/<\?xml[^>]*>/, '').replace(/<!--[\s\S]*?-->/g, '')
  const open = t.match(/<svg\b[^>]*>/)[0]
  const attr = (n) => (open.match(new RegExp(`\\s${n}="([^"]+)"`)) || [])[1]
  const vb = (attr('viewBox') || `0 0 ${parseFloat(attr('width'))} ${parseFloat(attr('height'))}`).split(/[ ,]+/).map(parseFloat)
  let inner = t.slice(t.indexOf(open) + open.length, t.lastIndexOf('</svg>'))
  const pre = `a${++svgN}-`
  inner = inner.replace(/\bid="([^"]+)"/g, `id="${pre}$1"`).replace(/url\(#([^)]+)\)/g, `url(#${pre}$1)`).replace(/href="#([^"]+)"/g, `href="#${pre}$1"`)
  const rootFill = attr('fill')
  if (tint) inner = inner.replace(/\bfill="(?!none)[^"]*"/g, `fill="${tint}"`)
  const sx = parseFloat(w) / vb[2], sy = parseFloat(h) / vb[3]
  const name = path.basename(src).replace(/\.svg$/, '')
  return `<g id="${name}" transform="translate(${x} ${y}) scale(${+sx.toFixed(6)} ${+sy.toFixed(6)}) translate(${-vb[0]} ${-vb[1]})"${tint ? ` fill="${tint}"${+tintOp < 1 ? ` fill-opacity="${tintOp}"` : ''}` : rootFill ? ` fill="${rootFill}"` : ''}>${inner}</g>`
})
fs.writeFileSync(path.join(OUT, 'poster.svg'), svg)
console.log(`poster.svg written: ${(svg.length / 1e6).toFixed(1)} MB, ${(svg.match(/<text/g) || []).length} text elements, ${(svg.match(/<image/g) || []).length} images`)
if (!VERIFY) { done() }

// ---------------- 4. verify ----------------
// B renders poster.svg (fonts from the same Google Fonts CSS the app uses) in a second tab
const fontsCss = (fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf8').match(/@import url\('([^']+)'\)/) || [])[1]
const htmlPath = path.join(OUT, '.verify.html')
fs.writeFileSync(htmlPath, `<!doctype html><html><head><meta charset="utf-8">${fontsCss ? `<link rel="stylesheet" href="${fontsCss}">` : ''}<style>html,body{margin:0;background:#fff}svg{display:block}</style></head><body>${svg}</body></html>`)
const tB = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json()
const B = await session(tB.webSocketDebuggerUrl)
await B.viewport(PW * S, PH * S)
await B.goto('file://' + htmlPath)
await B.evaluate(`(async () => { const fam = new Set(); for (const t of document.querySelectorAll('text, tspan')) { const cs = getComputedStyle(t); fam.add(cs.fontStyle + ' ' + cs.fontWeight + ' 100px ' + cs.fontFamily) } await Promise.all([...fam].map(f => document.fonts.load(f))); await document.fonts.ready; await new Promise(r => setTimeout(r, 1500)) })()`)
const svgView = async (x, y, w, h) => { await B.evaluate(`(() => { const s = document.querySelector('svg'); s.setAttribute('viewBox', '${x} ${y} ${w} ${h}'); s.setAttribute('width', ${w * (w > 6000 ? S : 1)}); s.setAttribute('height', ${h * (w > 6000 ? S : 1)}) })()`) }
await svgView(0, 0, X.W, X.H)
await sleep(300)
fs.writeFileSync(path.join(OUT, 'svg-render.png'), await B.shot({ x: 0, y: 0, width: X.W * S, height: X.H * S }))
if (PROBE) console.log('probe(svg):', JSON.stringify(await B.evaluate(PROBE)))
fs.unlinkSync(htmlPath)

// full-resolution comparison, tile by tile: A shows the poster at 1:1 shifted by (-x,-y); B shows the svg viewBox
await A.viewport(TW, TH)
await sleep(500)
// !important rule: React re-renders the viewer on resize and would overwrite an inline transform
await A.evaluate(`(() => { const st = document.createElement('style'); st.textContent = '#poster { position: fixed !important; left: 0 !important; top: 0 !important; transform: translate(var(--tx), var(--ty)) !important; }'; document.head.appendChild(st) })()`)
const pageAt = async (x, y, w, h) => {
  await A.evaluate(`(() => { const d = document.documentElement.style; d.setProperty('--tx', '${-x}px'); d.setProperty('--ty', '${-y}px') })()`)
  await sleep(150)
  return A.shot({ x: 0, y: 0, width: w, height: h })
}
const shotSvg = async (x, y, w, h) => { await B.viewport(w, h); await svgView(x, y, w, h); await sleep(150); return B.shot({ x: 0, y: 0, width: w, height: h }) }
for (const [k, [cx, cy, cw, ch]] of CROPS.entries()) {
  fs.writeFileSync(path.join(OUT, `crop${k}-page.png`), await pageAt(cx, cy, cw, ch))
  fs.writeFileSync(path.join(OUT, `crop${k}-svg.png`), await shotSvg(cx, cy, cw, ch))
}
if (args.includes('--crops-only')) done()
// diff runs in a third, blank tab
const tC = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json()
const C = await session(tC.webSocketDebuggerUrl)
await C.evaluate(`(() => {
  const m = document.createElement('canvas'); m.width = ${Math.round(X.W * S)}; m.height = ${Math.round(X.H * S)}; window.__mosaic = m
  window.__diff = async (pa, pb, x, y, w, h) => {
    const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s })
    const [a, b] = await Promise.all([load(pa), load(pb)])
    const px = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h).data }
    const P = px(a), Q = px(b)
    const out = document.createElement('canvas'); out.width = w; out.height = h
    const o = out.getContext('2d'); const D = o.createImageData(w, h)
    let bad = 0, sum = 0
    for (let k = 0; k < P.length; k += 4) {
      const d = Math.max(Math.abs(P[k] - Q[k]), Math.abs(P[k + 1] - Q[k + 1]), Math.abs(P[k + 2] - Q[k + 2]))
      sum += d
      const g = (P[k] + P[k + 1] + P[k + 2]) / 3
      const hit = d > 64
      if (hit) bad++
      D.data[k] = hit ? 255 : g * 0.3; D.data[k + 1] = hit ? 0 : g * 0.3; D.data[k + 2] = hit ? 0 : g * 0.3; D.data[k + 3] = 255
    }
    o.putImageData(D, 0, 0)
    m.getContext('2d').drawImage(out, x * ${S}, y * ${S}, w * ${S}, h * ${S})
    return { bad, mean: sum / (w * h) }
  }
})()`)
const tiles = []
let tbad = 0, tsum = 0
for (let y = 0; y < X.H; y += TH) for (let x = 0; x < X.W; x += TW) {
  const w = Math.min(TW, X.W - x), h = Math.min(TH, X.H - y)
  const pa = await pageAt(x, y, w, h), pb = await shotSvg(x, y, w, h)
  const r = await C.evaluate(`window.__diff(${JSON.stringify(pa.toString('base64'))}, ${JSON.stringify(pb.toString('base64'))}, ${x}, ${y}, ${w}, ${h})`)
  tbad += r.bad; tsum += r.mean * w * h
  tiles.push({ x, y, w, h, pct: +((100 * r.bad) / (w * h)).toFixed(3), mean: +r.mean.toFixed(2), pa, pb })
  process.stdout.write('.')
}
console.log()
const mosaic = await C.evaluate('window.__mosaic.toDataURL("image/png")')
fs.writeFileSync(path.join(OUT, 'diff.png'), Buffer.from(mosaic.split(',')[1], 'base64'))
tiles.sort((a, b) => b.pct - a.pct)
for (const t of tiles.slice(0, 4)) { fs.writeFileSync(path.join(OUT, `tile-${t.x}-${t.y}-page.png`), t.pa); fs.writeFileSync(path.join(OUT, `tile-${t.x}-${t.y}-svg.png`), t.pb) }
const rep = { pixelsOffPct: +((100 * tbad) / (X.W * X.H)).toFixed(3), meanAbs: +(tsum / (X.W * X.H)).toFixed(3), threshold: '64/255 on any channel, full resolution', tiles: tiles.map(({ pa, pb, ...t }) => t) }
fs.writeFileSync(path.join(OUT, 'diff.json'), JSON.stringify(rep, null, 1))
console.log(`verify (1:1): ${rep.pixelsOffPct}% of pixels differ by >64/255, mean |diff| ${rep.meanAbs}/255`)
console.log('worst tiles:', rep.tiles.slice(0, 8).map((t) => `(${t.x},${t.y}) ${t.pct}%`).join('  '))
done()

function done() {
  chrome.off('exit', onChromeExit)
  chrome.kill('SIGKILL')
  process.exit(0)
}
