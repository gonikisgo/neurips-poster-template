// In-page DOM -> SVG extractor (runs inside the rendered poster page, injected by export.mjs).
// Reads the *rendered* layout of #poster (so it never drifts from App.tsx) and emits Figma-friendly SVG:
//   HTML text  -> <text> per line (editable text layers, real fonts)
//   boxes      -> <rect> (background, border, hard shadows, outlines)
//   inline SVG -> cloned vectors with computed styles baked in, patterns expanded, text re-anchored
//   <img>      -> <image> (embedded later by export.mjs) / inlined SVG
//   CSS gradients that are not plain geometry -> raster jobs (PNG, captured by export.mjs)
/* eslint-disable */
window.__figmaExtract = async function () {
  await document.fonts.ready
  const posterEl = document.getElementById('poster')
  const pr0 = posterEl.getBoundingClientRect()
  const W = posterEl.offsetWidth, H = posterEl.offsetHeight
  const warn = []
  const rasterJobs = []
  const svgAssets = new Set()
  let uid = 0
  const nid = (p) => `${p}${++uid}`
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const f = (v) => { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? '0' : String(r) }
  const px = (v) => parseFloat(v) || 0

  // ---------- colours ----------
  const parseColor = (c) => {
    if (!c || c === 'transparent') return null
    let m = c.match(/^rgba?\(([^)]+)\)$/)
    if (m) {
      const p = m[1].split(/[ ,/]+/).filter(Boolean).map(parseFloat)
      const a = p.length > 3 ? p[3] : 1
      if (a === 0) return null
      return { hex: '#' + p.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''), a }
    }
    m = c.match(/^color\(srgb ([^)]+)\)$/)
    if (m) {
      const p = m[1].split(/[ /]+/).filter(Boolean).map(parseFloat)
      const a = p.length > 3 ? p[3] : 1
      if (a === 0) return null
      return { hex: '#' + p.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join(''), a }
    }
    m = c.match(/^okl(ab|ch)\(([^)]+)\)$/)
    if (m) {
      const p = m[2].split(/[ /]+/).filter(Boolean).map(parseFloat)
      let [Lc, A, B] = p
      if (m[1] === 'ch') { const h = (B * Math.PI) / 180; [A, B] = [A * Math.cos(h), A * Math.sin(h)] }
      const a = p.length > 3 ? p[3] : 1
      if (a === 0) return null
      const l_ = Lc + 0.3963377774 * A + 0.2158037573 * B, m_ = Lc - 0.1055613458 * A - 0.0638541728 * B, s_ = Lc - 0.0894841775 * A - 1.291485548 * B
      const l3 = l_ ** 3, m3 = m_ ** 3, s3 = s_ ** 3
      const lin = [4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3, -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3, -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3]
      const g = (v) => { v = Math.max(0, Math.min(1, v)); return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055 }
      return { hex: '#' + lin.map((v) => Math.round(g(v) * 255).toString(16).padStart(2, '0')).join(''), a }
    }
    warn.push('unparsed colour ' + c)
    return { hex: '#000000', a: 1 }
  }
  const fillAttr = (c, name = 'fill') => (c ? `${name}="${c.hex}"${c.a < 1 ? ` ${name}-opacity="${f(c.a)}"` : ''}` : `${name}="none"`)
  const splitTop = (s) => { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur.trim()); cur = '' } else cur += ch } if (cur.trim()) out.push(cur.trim()); return out }

  // ---------- 1. collect HTML-level elements, record + disable transforms ----------
  const isSvgRoot = (e) => e instanceof SVGSVGElement && !(e.parentNode instanceof SVGElement)
  const htmlEls = [posterEl, ...posterEl.querySelectorAll('*')].filter((e) => !(e instanceof SVGElement) || isSvgRoot(e))
  const info = new Map()
  for (const e of htmlEls) {
    const cs = getComputedStyle(e)
    let m = new DOMMatrix()
    if (cs.translate && cs.translate !== 'none') { const [a, b] = cs.translate.split(' '); m = m.translate(px(a), px(b)) }
    if (cs.rotate && cs.rotate !== 'none') m = m.rotate(parseFloat(cs.rotate))
    if (cs.scale && cs.scale !== 'none') { const p = cs.scale.split(' ').map(parseFloat); m = m.scale(p[0], p.length > 1 ? p[1] : p[0]) }
    if (cs.transform && cs.transform !== 'none') m = m.multiply(new DOMMatrix(cs.transform))
    const [ox, oy] = cs.transformOrigin.split(' ').map(px)
    info.set(e, { cs, local: m.isIdentity ? null : m, ox, oy, inlineT: e.style.cssText })
  }
  for (const e of htmlEls) { e.style.setProperty('transform', 'none', 'important'); e.style.setProperty('translate', 'none', 'important'); e.style.setProperty('rotate', 'none', 'important'); e.style.setProperty('scale', 'none', 'important') }
  const pr = posterEl.getBoundingClientRect()
  const rectOf = (e) => { const r = e.getBoundingClientRect(); return { x: r.left - pr.left, y: r.top - pr.top, w: r.width, h: r.height } }
  for (const e of htmlEls) {
    const i = info.get(e)
    i.r = rectOf(e)
    const parent = e === posterEl ? null : info.get(e.parentElement)
    let M = parent ? parent.M : new DOMMatrix()
    if (i.local) {
      const cx = i.r.x + i.ox, cy = i.r.y + i.oy
      M = M.multiply(new DOMMatrix().translate(cx, cy).multiply(i.local).translate(-cx, -cy))
    }
    i.M = e === posterEl ? new DOMMatrix() : M
  }
  const mstr = (M) => (M.isIdentity ? '' : `matrix(${[M.a, M.b, M.c, M.d, M.e, M.f].map((v) => Math.round(v * 1e6) / 1e6).join(' ')})`)

  // ---------- primitive list in paint order ----------
  // each prim: { svg, M, clips: [clipKey], op, group }
  const prims = []
  const clipDefs = new Map() // key -> svg
  let curGroup = null
  const push = (svg, ctx) => { if (svg) prims.push({ svg, M: ctx.M, clips: ctx.clips, op: ctx.op, group: curGroup }) }

  // ---------- fonts: map requested weight to the face the browser actually used ----------
  const faces = {}
  for (const ff of document.fonts) if (ff.status === 'loaded') { const fam = ff.family.replace(/["']/g, ''); (faces[fam + '|' + ff.style] ||= new Set()).add(parseInt(ff.weight) || 400) }
  const famName = (list) => list.split(',')[0].trim().replace(/["']/g, '')
  const usedWeight = (fam, w, style) => {
    const set = faces[fam + '|' + style] || faces[fam + '|normal']
    if (!set || !set.size) return w
    const ws = [...set].sort((a, b) => a - b)
    if (set.has(w)) return w
    if (w > 500) { const up = ws.filter((x) => x >= w); if (up.length) return up[0]; return ws[ws.length - 1] }
    if (w < 400) { const dn = ws.filter((x) => x <= w); if (dn.length) return dn[dn.length - 1]; return ws[0] }
    if (w === 400 && set.has(500)) return 500
    const dn = ws.filter((x) => x <= w); return dn.length ? dn[dn.length - 1] : ws[0]
  }
  const ascCache = new Map()
  const cvs = document.createElement('canvas').getContext('2d')
  const ascentOf = (fontCss) => {
    if (!ascCache.has(fontCss)) { cvs.font = fontCss; const mm = cvs.measureText('Hg'); ascCache.set(fontCss, mm.fontBoundingBoxAscent) }
    return ascCache.get(fontCss)
  }
  const descCache = new Map()
  const descentOf = (fontCss) => {
    if (!descCache.has(fontCss)) { cvs.font = fontCss; descCache.set(fontCss, cvs.measureText('Hg').fontBoundingBoxDescent) }
    return descCache.get(fontCss)
  }
  const fontAttrs = (cs) => {
    const fam = famName(cs.fontFamily)
    const w = usedWeight(fam, parseInt(cs.fontWeight), cs.fontStyle === 'italic' ? 'italic' : 'normal')
    const ls = cs.letterSpacing === 'normal' ? 0 : px(cs.letterSpacing)
    return `font-family="${esc(fam)}" font-size="${f(px(cs.fontSize))}" font-weight="${w}"${cs.fontStyle !== 'normal' ? ` font-style="${cs.fontStyle}"` : ''}${ls ? ` letter-spacing="${f(ls)}"` : ''}`
  }

  // ---------- box painting ----------
  const radiusOf = (cs, r) => {
    const rr = (v, d) => (String(v).includes('%') ? (parseFloat(v) / 100) * d : px(v))
    const tl = cs.borderTopLeftRadius.split(' ')
    const rx = rr(tl[0], r.w), ry = rr(tl[1] ?? tl[0], r.h)
    return { rx: Math.min(rx, r.w / 2), ry: Math.min(ry, r.h / 2) }
  }
  const rectSvg = (x, y, w, h, rx, ry, attrs) => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${rx > 0 ? ` rx="${f(rx)}" ry="${f(ry)}"` : ''} ${attrs}/>`

  function paintBox(e, i, ctx, rects) {
    const cs = i.cs
    for (const r of rects) {
      const { rx, ry } = radiusOf(cs, r)
      // shadows (outer only), back to front
      if (cs.boxShadow && cs.boxShadow !== 'none') {
        for (const sh of splitTop(cs.boxShadow).reverse()) {
          if (/inset/.test(sh)) { warn.push('inset shadow skipped'); continue }
          const cm = sh.match(/^(rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-f]+)\s*(.*)$/i)
          const col = parseColor(cm ? cm[1] : 'rgb(0,0,0)')
          const [sx, sy, blur = 0, spread = 0] = (cm ? cm[2] : sh).split(/\s+/).map(px)
          if (!col) continue
          let filt = ''
          if (blur > 0) { const id = nid('blur'); clipDefs.set(id, `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(blur / 2)}"/></filter>`); filt = ` filter="url(#${id})"` }
          push(rectSvg(r.x + sx - spread, r.y + sy - spread, r.w + 2 * spread, r.h + 2 * spread, rx ? rx + spread : 0, ry ? ry + spread : 0, fillAttr(col) + filt), ctx)
        }
      }
      const bg = parseColor(cs.backgroundColor)
      if (bg) push(rectSvg(r.x, r.y, r.w, r.h, rx, ry, fillAttr(bg)), ctx)
      if (cs.backgroundImage && cs.backgroundImage !== 'none') paintBgImage(e, i, ctx, r, rx, ry)
      if (cs.maskImage && cs.maskImage !== 'none') paintMask(e, i, ctx, r)
      // borders
      const sides = ['Top', 'Right', 'Bottom', 'Left'].map((s) => ({ s, w: px(cs[`border${s}Width`]), st: cs[`border${s}Style`], c: parseColor(cs[`border${s}Color`]) })).map((b) => (b.st === 'none' || b.st === 'hidden' ? { ...b, w: 0 } : b))
      const same = sides.every((b) => b.c) && sides.every((b) => b.w === sides[0].w && b.st === sides[0].st && b.c && sides[0].c && b.c.hex === sides[0].c.hex && b.c.a === sides[0].c.a)
      const dash = (b) => (b.st === 'dashed' ? ` stroke-dasharray="${f(b.w * 2)} ${f(b.w * 2)}"` : b.st === 'dotted' ? ` stroke-dasharray="0 ${f(b.w * 2)}" stroke-linecap="round"` : '')
      if (same && sides[0].w > 0) {
        const b = sides[0], hw = b.w / 2
        push(rectSvg(r.x + hw, r.y + hw, r.w - b.w, r.h - b.w, Math.max(0, rx - hw), Math.max(0, ry - hw), `fill="none" ${fillAttr(b.c, 'stroke')} stroke-width="${f(b.w)}"${dash(b)}`), ctx)
      } else {
        for (const b of sides) {
          if (!b.w || !b.c) continue // transparent sides still shape their neighbours' mitres
          if (b.st === 'solid') {
            // CSS paints each side as a trapezoid mitred into its neighbours (this also yields "border triangles")
            const [t, rt, bt, lt] = sides.map((q) => q.w), x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h
            const P = { Top: [[x0, y0], [x1, y0], [x1 - rt, y0 + t], [x0 + lt, y0 + t]], Bottom: [[x0, y1], [x1, y1], [x1 - rt, y1 - bt], [x0 + lt, y1 - bt]], Left: [[x0, y0], [x0 + lt, y0 + t], [x0 + lt, y1 - bt], [x0, y1]], Right: [[x1, y0], [x1 - rt, y0 + t], [x1 - rt, y1 - bt], [x1, y1]] }[b.s]
            push(`<path d="M${P.map(([px, py]) => f(px) + ' ' + f(py)).join('L')}Z" ${fillAttr(b.c)}/>`, ctx)
          } else {
            const hw = b.w / 2
            const l = { Top: [r.x, r.y + hw, r.x + r.w, r.y + hw], Bottom: [r.x, r.y + r.h - hw, r.x + r.w, r.y + r.h - hw], Left: [r.x + hw, r.y, r.x + hw, r.y + r.h], Right: [r.x + r.w - hw, r.y, r.x + r.w - hw, r.y + r.h] }[b.s]
            push(`<line x1="${f(l[0])}" y1="${f(l[1])}" x2="${f(l[2])}" y2="${f(l[3])}" ${fillAttr(b.c, 'stroke')} stroke-width="${f(b.w)}"${dash(b)}/>`, ctx)
          }
        }
      }
    }
    // outline (on the border box of the element)
    if (cs.outlineStyle !== 'none' && px(cs.outlineWidth) > 0) {
      const ow = px(cs.outlineWidth), oo = px(cs.outlineOffset), c = parseColor(cs.outlineColor), r = i.r
      const d = oo + ow / 2
      if (c) push(rectSvg(r.x - d, r.y - d, r.w + 2 * d, r.h + 2 * d, 0, 0, `fill="none" ${fillAttr(c, 'stroke')} stroke-width="${f(ow)}"`), ctx)
    }
  }

  // CSS background-image: simple hard-stop vertical linear gradients become rects, the poster canvas becomes
  // vector geometry, anything else becomes a raster job.
  function paintBgImage(e, i, ctx, r, rx, ry) {
    const cs = i.cs
    const bi = cs.backgroundImage
    const layers = splitTop(bi)
    // highlighter: linear-gradient(transparent X%, C X%)
    const hl = bi.match(/^linear-gradient\((?:rgba\(0, 0, 0, 0\)|transparent) ([\d.]+)%, (rgba?\([^)]*\)) ([\d.]+)%\)$/)
    if (hl && hl[1] === hl[3]) { const p = parseFloat(hl[1]) / 100; push(rectSvg(r.x, r.y + r.h * p, r.w, r.h * (1 - p), 0, 0, fillAttr(parseColor(hl[2]))), ctx); return }
    // vertical gradient fill (two colour stops)
    const lg = bi.match(/^linear-gradient\((rgba?\([^)]*\)) 0%, (rgba?\([^)]*\)) 100%\)$/)
    if (lg) {
      const id = nid('lg'), a = parseColor(lg[1]), b = parseColor(lg[2])
      clipDefs.set(id, `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a.hex}" stop-opacity="${a.a}"/><stop offset="1" stop-color="${b.hex}" stop-opacity="${b.a}"/></linearGradient>`)
      push(rectSvg(r.x, r.y, r.w, r.h, rx, ry, `fill="url(#${id})"`), ctx); return
    }
    // repeating-linear-gradient with hard stops -> stripes (perpendicular to the gradient line), clipped to the box
    const rl = bi.match(/^repeating-linear-gradient\((?:(-?[\d.]+)deg, |to bottom, )?(.*)\)$/)
    if (rl) {
      const ang = rl[1] !== undefined ? parseFloat(rl[1]) : 180
      const stops = splitTop(rl[2]).map((st) => { const m2 = st.match(/^(.*\))\s+([\d.]+)px$/); return { c: parseColor(m2[1]), at: parseFloat(m2[2]) } })
      // stops come in pairs (C a, C b): coloured band from a to b
      const bands = []
      for (let k = 0; k + 1 < stops.length; k += 2) bands.push({ c: stops[k].c, a: stops[k].at, b: stops[k + 1].at })
      const per = stops[stops.length - 1].at
      const t = (ang * Math.PI) / 180, dx = Math.sin(t), dy = -Math.cos(t)
      const len = Math.abs(r.w * dx) + Math.abs(r.h * dy) // CSS gradient line length
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2, sx = cx - (dx * len) / 2, sy = cy - (dy * len) / 2
      const L = r.w + r.h, nx = -dy, ny = dx
      const id = nid('clip')
      clipDefs.set(id, `<clipPath id="${id}">${rectSvg(r.x, r.y, r.w, r.h, rx, ry, '')}</clipPath>`)
      let body = ''
      for (const b of bands) {
        if (!b.c) continue
        let d = ''
        for (let o = 0; o < len; o += per) {
          const p0 = o + b.a, p1 = o + b.b
          const ax = sx + dx * p0, ay = sy + dy * p0, bx = sx + dx * p1, by = sy + dy * p1
          d += `M${f(ax - nx * L)} ${f(ay - ny * L)}L${f(ax + nx * L)} ${f(ay + ny * L)}L${f(bx + nx * L)} ${f(by + ny * L)}L${f(bx - nx * L)} ${f(by - ny * L)}z`
        }
        body += `<path d="${d}" ${fillAttr(b.c)}/>`
      }
      push(`<g clip-path="url(#${id})">${body}</g>`, ctx); return
    }
    // the poster canvas: square grid lines + staggered dots + radial glows
    if (layers.every((l) => /^linear-gradient\((?:90deg, )?rgba\([^)]*\) 3px, rgba\(0, 0, 0, 0\) 3px\)$/.test(l))) {
      const sizes = cs.backgroundSize.split(',').map((s) => px(s.trim().split(' ')[0]))
      layers.forEach((l, k) => {
        const c = parseColor(l.match(/(rgba\([^)]*\)) 3px/)[1]), step = sizes[k], vert = l.includes('90deg')
        let d = ''
        if (vert) for (let x = 0; x < r.w; x += step) d += `M${f(r.x + x)} ${f(r.y)}h3v${f(r.h)}h-3z`
        else for (let y = 0; y < r.h; y += step) d += `M${f(r.x)} ${f(r.y + y)}h${f(r.w)}v3h${f(-r.w)}z`
        push(`<path d="${d}" ${fillAttr(c)}/>`, ctx)
      })
      return
    }
    if (layers.every((l) => /^radial-gradient\(rgba\([^)]*\) [\d.]+px, rgba\(0, 0, 0, 0\) [\d.]+px\)$/.test(l))) {
      const sizes = cs.backgroundSize.split(',').map((s) => px(s.trim().split(' ')[0]))
      const poss = cs.backgroundPosition.split(',').map((s) => s.trim().split(' ').map(px))
      layers.forEach((l, k) => {
        const mm = l.match(/(rgba\([^)]*\)) ([\d.]+)px, rgba\(0, 0, 0, 0\) ([\d.]+)px/)
        const c = parseColor(mm[1]), rad = (parseFloat(mm[2]) + parseFloat(mm[3])) / 2, step = sizes[k], [px0, py0] = poss[k]
        let d = ''
        for (let y = (py0 % step) - step; y < r.h + step; y += step)
          for (let x = (px0 % step) - step; x < r.w + step; x += step) {
            const cx = x + step / 2, cy = y + step / 2
            if (cx + rad < 0 || cy + rad < 0 || cx - rad > r.w || cy - rad > r.h) continue
            d += `M${f(r.x + cx - rad)} ${f(r.y + cy)}a${f(rad)} ${f(rad)} 0 1 0 ${f(2 * rad)} 0a${f(rad)} ${f(rad)} 0 1 0 ${f(-2 * rad)} 0z`
          }
        push(`<path d="${d}" ${fillAttr(c)}/>`, ctx)
      })
      return
    }
    if (layers.every((l) => /^radial-gradient\([\d.]+% [\d.]+% at [\d.]+% [\d.]+%, rgba\([^)]*\), rgba\(0, 0, 0, 0\) 100%\)$/.test(l))) {
      for (const l of layers.reverse()) {
        const mm = l.match(/\(([\d.]+)% ([\d.]+)% at ([\d.]+)% ([\d.]+)%, (rgba\([^)]*\))/)
        const rx2 = (parseFloat(mm[1]) / 100) * r.w, ry2 = (parseFloat(mm[2]) / 100) * r.h, cx = r.x + (parseFloat(mm[3]) / 100) * r.w, cy = r.y + (parseFloat(mm[4]) / 100) * r.h
        const c = parseColor(mm[5]), id = nid('rg')
        clipDefs.set(id, `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="translate(${f(cx)} ${f(cy)}) scale(${f(rx2)} ${f(ry2)})"><stop offset="0" stop-color="${c.hex}" stop-opacity="${c.a}"/><stop offset="1" stop-color="${c.hex}" stop-opacity="0"/></radialGradient>`)
        push(rectSvg(r.x, r.y, r.w, r.h, 0, 0, `fill="url(#${id})"`), ctx)
      }
      return
    }
    // fallback: raster just this element's background
    const id = nid('raster')
    e.dataset.figRaster = id
    rasterJobs.push({ id, x: r.x, y: r.y, w: r.w, h: r.h, css: bi.slice(0, 120) })
    push(`<image data-raster="${id}" x="${f(r.x)}" y="${f(r.y)}" width="${f(r.w)}" height="${f(r.h)}" preserveAspectRatio="none"/>`, ctx)
  }

  // mask-image: url(x.svg) on a solid colour -> the svg's shapes filled with that colour
  function paintMask(e, i, ctx, r) {
    const m = i.cs.maskImage.match(/url\("?([^")]+)"?\)/)
    const c = parseColor(i.cs.backgroundColor)
    if (!m || !c) { warn.push('unsupported mask ' + i.cs.maskImage); return }
    svgAssets.add(m[1])
    prims.pop() // the solid background rect pushed just before is replaced by the masked shapes
    push(`<svgasset src="${esc(m[1])}" x="${f(r.x)}" y="${f(r.y)}" width="${f(r.w)}" height="${f(r.h)}" tint="${c.hex}" tint-opacity="${c.a}" aspect="none"/>`, ctx)
  }

  // ---------- text ----------
  function paintText(node, ctx) {
    const pe = node.parentElement
    const cs = getComputedStyle(pe)
    if (cs.visibility !== 'visible') return
    const col = parseColor(cs.color)
    if (!col) return
    const raw = node.data
    const pre = /^pre/.test(cs.whiteSpace)
    const tt = cs.textTransform
    const xform = (s) => (tt === 'uppercase' ? s.toUpperCase() : tt === 'lowercase' ? s.toLowerCase() : s)
    // split into words (keeping offsets), measure each word's first client rect
    const range = document.createRange()
    const words = []
    const re = /\S+/g
    let m
    while ((m = re.exec(raw))) {
      range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length)
      const rs = [...range.getClientRects()].filter((q) => q.width > 0 || q.height > 0)
      if (!rs.length) continue
      // a word can break across lines (e.g. at hyphens / overflow-wrap): split it at rect boundaries per char
      if (rs.length > 1) {
        let start = m.index, lastTop = null
        for (let k = m.index; k < m.index + m[0].length; k++) {
          range.setStart(node, k); range.setEnd(node, k + 1)
          const q = range.getClientRects()[0]
          if (!q) continue
          if (lastTop !== null && Math.abs(q.top - lastTop) > 1) {
            range.setStart(node, start); range.setEnd(node, k)
            words.push({ s: start, e: k, r: range.getClientRects()[0] })
            start = k
          }
          lastTop = q.top
        }
        range.setStart(node, start); range.setEnd(node, m.index + m[0].length)
        words.push({ s: start, e: m.index + m[0].length, r: range.getClientRects()[0] })
      } else words.push({ s: m.index, e: m.index + m[0].length, r: rs[0] })
    }
    if (!words.length) return
    // group into lines by top
    const lines = []
    for (const w of words) {
      const L = lines[lines.length - 1]
      if (L && Math.abs(w.r.top - L.top) < 1 && w.r.left >= L.right - 1) { L.e = w.e; L.right = w.r.right; L.ws.push(w) }
      else lines.push({ s: w.s, e: w.e, top: w.r.top, left: w.r.left, right: w.r.right, ws: [w] })
    }
    const fontCss = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const asc = ascentOf(fontCss)
    const fa = fontAttrs(cs)
    const deco = cs.textDecorationLine
    for (const L of lines) {
      let s = raw.slice(L.s, L.e)
      if (!pre) s = s.replace(/\s+/g, ' ')
      s = xform(s)
      const x = L.left - pr.left, y = L.top - pr.top + asc
      push(`<text x="${f(x)}" y="${f(y)}" ${fa} ${fillAttr(col)}${pre ? ' xml:space="preserve"' : ''}>${esc(s)}</text>`, ctx)
      const dcol = parseColor(cs.textDecorationColor) || col
      const fs = px(cs.fontSize), th = cs.textDecorationThickness && cs.textDecorationThickness.endsWith('px') ? px(cs.textDecorationThickness) : Math.max(1, fs * 0.06)
      if (deco && deco.includes('underline')) push(rectSvg(x, y + fs * 0.12, L.right - L.left, th, 0, 0, fillAttr(dcol)), ctx)
      if (deco && deco.includes('line-through')) push(rectSvg(x, y - fs * 0.3 - th / 2, L.right - L.left, th, 0, 0, fillAttr(dcol)), ctx)
    }
  }

  // ---------- images ----------
  function paintImg(e, i, ctx) {
    const cs = i.cs, r = i.r
    const bl = px(cs.borderLeftWidth) + px(cs.paddingLeft), bt = px(cs.borderTopWidth) + px(cs.paddingTop)
    const cw = r.w - bl - px(cs.borderRightWidth) - px(cs.paddingRight), ch = r.h - bt - px(cs.borderBottomWidth) - px(cs.paddingBottom)
    const cx = r.x + bl, cy = r.y + bt
    const nw = e.naturalWidth || cw, nh = e.naturalHeight || ch
    let dw = cw, dh = ch
    const fit = cs.objectFit
    if (fit === 'cover' || fit === 'contain' || fit === 'scale-down' || fit === 'none') {
      const k = fit === 'cover' ? Math.max(cw / nw, ch / nh) : fit === 'none' ? 1 : Math.min(cw / nw, ch / nh, fit === 'scale-down' ? 1 : Infinity)
      dw = nw * k; dh = nh * k
    }
    const [opx, opy] = cs.objectPosition.split(' ')
    const pos = (v, free) => (v.includes('%') ? (parseFloat(v) / 100) * free : px(v))
    const dx = cx + pos(opx, cw - dw), dy = cy + pos(opy ?? '50%', ch - dh)
    const src = e.currentSrc || e.src
    let body
    if (/\.svg(\?|$)/i.test(src)) { svgAssets.add(src); body = `<svgasset src="${esc(src)}" x="${f(dx)}" y="${f(dy)}" width="${f(dw)}" height="${f(dh)}" aspect="none"/>` }
    else body = `<image href="${esc(src)}" x="${f(dx)}" y="${f(dy)}" width="${f(dw)}" height="${f(dh)}" preserveAspectRatio="none"/>`
    if (dw > cw + 0.5 || dh > ch + 0.5 || dx < cx - 0.5 || dy < cy - 0.5) {
      const id = nid('clip')
      clipDefs.set(id, `<clipPath id="${id}"><rect x="${f(cx)}" y="${f(cy)}" width="${f(cw)}" height="${f(ch)}"/></clipPath>`)
      body = `<g clip-path="url(#${id})">${body}</g>`
    }
    push(body, ctx)
  }

  // ---------- inline SVG: clone with computed styles baked in ----------
  const SVG_PROPS = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'opacity']
  const DEFAULTS = { 'fill-opacity': '1', 'fill-rule': 'nonzero', 'stroke-opacity': '1', 'stroke-dasharray': 'none', 'stroke-dashoffset': '0px', 'stroke-linecap': 'butt', 'stroke-linejoin': 'miter', 'stroke-miterlimit': '4', opacity: '1', stroke: 'none', 'stroke-width': '1px' }
  function paintSvg(svg, i, ctx) {
    const cs = i.cs, r = i.r
    const bl = px(cs.borderLeftWidth) + px(cs.paddingLeft), bt = px(cs.borderTopWidth) + px(cs.paddingTop)
    const cw = r.w - bl - px(cs.borderRightWidth) - px(cs.paddingRight), ch = r.h - bt - px(cs.borderBottomWidth) - px(cs.paddingBottom)
    let T = new DOMMatrix().translate(r.x + bl, r.y + bt)
    const vb = svg.viewBox && svg.viewBox.baseVal
    if (vb && vb.width && vb.height) {
      const par = svg.getAttribute('preserveAspectRatio') || 'xMidYMid meet'
      let sx = cw / vb.width, sy = ch / vb.height
      let tx = 0, ty = 0
      if (!/none/.test(par)) {
        const k = /slice/.test(par) ? Math.max(sx, sy) : Math.min(sx, sy)
        const al = par.match(/x(Min|Mid|Max)Y(Min|Mid|Max)/) || [0, 'Mid', 'Mid']
        tx = { Min: 0, Mid: 0.5, Max: 1 }[al[1]] * (cw - vb.width * k); ty = { Min: 0, Mid: 0.5, Max: 1 }[al[2]] * (ch - vb.height * k)
        sx = sy = k
      }
      T = T.translate(tx, ty).scale(sx, sy).translate(-vb.x, -vb.y)
    }
    const patterns = {}
    for (const p of svg.querySelectorAll('pattern')) patterns[p.id] = p
    const out = []
    const walk = (el) => {
      const tag = el.tagName
      if (['defs', 'pattern', 'title', 'desc', 'style', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'filter', 'marker', 'symbol'].includes(tag)) {
        if (['clipPath', 'mask', 'linearGradient', 'radialGradient', 'filter', 'marker', 'symbol'].includes(tag)) warn.push('svg <' + tag + '> not handled')
        return ''
      }
      const ecs = getComputedStyle(el)
      if (ecs.display === 'none' || ecs.visibility === 'hidden') return ''
      const attrs = []
      for (const a of el.attributes) {
        if (['class', 'style', 'fill', 'stroke', 'color', 'text-anchor', 'dominant-baseline', 'paint-order', 'font-family', 'font-size', 'font-weight', 'letter-spacing', 'font-style', 'dx', 'dy'].includes(a.name) || a.name.startsWith('stroke') || a.name.endsWith('opacity')) continue
        if ((tag === 'text' || tag === 'tspan') && (a.name === 'x' || a.name === 'y')) continue
        attrs.push(`${a.name}="${esc(a.value)}"`)
      }
      let fillUrl = null
      for (const p of SVG_PROPS) {
        let v = ecs.getPropertyValue(p)
        if (!v || v === DEFAULTS[p]) continue
        if (p === 'fill' || p === 'stroke') {
          const um = v.match(/url\("?#([^")]+)"?\)/)
          if (um) { if (p === 'fill' && patterns[um[1]]) { fillUrl = um[1]; v = 'none' } else { warn.push('svg paint ' + v); v = 'none' } }
          else if (v !== 'none') { const c = parseColor(v); attrs.push(c ? fillAttr(c, p) : `${p}="none"`); continue }
        }
        if (p === 'stroke-width' || p === 'stroke-dashoffset') v = f(px(v))
        if (p === 'stroke-dasharray') v = v.split(/[ ,]+/).map(px).map(f).join(' ')
        attrs.push(`${p}="${esc(v)}"`)
      }
      if (ecs.fill === 'none' && !attrs.some((a) => a.startsWith('fill='))) attrs.push('fill="none"')
      if (tag === 'text') return textEl(el, ecs, attrs)
      const kids = [...el.children].map(walk).join('')
      let s = `<${tag} ${attrs.join(' ')}${kids ? `>${kids}</${tag}>` : '/>'}`
      if (fillUrl) s = expandPattern(el, patterns[fillUrl], attrs) + s
      return s
    }
    const textEl = (el, ecs, attrs) => {
      // re-anchor: every run gets an explicit baseline start (no text-anchor / dominant-baseline needed in Figma).
      // Position = the run's first glyph cell (getExtentOfChar, user space) + the font's ascent.
      const runs = []
      const visit = (n, rcs) => {
        for (const c of n.childNodes) {
          if (c.nodeType === 3) runs.push({ raw: c.data, cs: rcs })
          else if (c.nodeType === 1) visit(c, getComputedStyle(c))
        }
      }
      visit(el, ecs)
      // addressable characters: newlines dropped, tabs -> spaces, runs of spaces collapsed, leading/trailing stripped
      let col = '', starts = []
      for (const run of runs) {
        const t = run.raw.replace(/\n/g, '').replace(/\t/g, ' ')
        let s0 = col.length, txt = ''
        for (const ch of t) { if (ch === ' ' && (col + txt).endsWith(' ')) continue; if (ch === ' ' && !(col + txt).length) continue; txt += ch }
        run.ci = s0; run.s = txt; col += txt
      }
      const total = el.getNumberOfChars()
      if (col.replace(/ $/, '').length !== total) warn.push(`svg text char count mismatch: "${col.slice(0, 40)}" ${col.length} vs ${total}`)
      const stroke = ecs.paintOrder && ecs.paintOrder.startsWith('stroke') && ecs.stroke !== 'none'
      const parts = []
      for (const run of runs) {
        let s = run.s
        let ci = run.ci
        while (s.startsWith(' ')) { s = s.slice(1); ci++ }
        s = s.replace(/ $/, '')
        if (!s || ci >= total) continue
        let x = 0, y = 0
        try {
          const ext = el.getExtentOfChar(ci)
          const fcss = `${run.cs.fontStyle} ${run.cs.fontWeight} ${run.cs.fontSize} ${run.cs.fontFamily}`
          x = ext.x; y = ext.y + ascentOf(fcss) * (ext.height / (ascentOf(fcss) + descentOf(fcss)) || 1)
        } catch (err) { warn.push('svg text position failed: ' + s) }
        parts.push({ x, y, s, cs: run.cs })
      }
      // one <text> per run with its own x/y (Figma's importer is unreliable with positioned <tspan>s)
      const mk = (onlyStroke, onlyFill) => {
        let a = attrs.filter((x) => !(onlyFill && x.startsWith('stroke')))
        if (onlyStroke) a = a.filter((x) => !x.startsWith('fill')).concat('fill="none"')
        return parts.map((p) => {
          let aa = a
          if (p.cs !== ecs && !onlyStroke) { const rp = runPaint(p.cs); if (rp) aa = aa.filter((x) => !x.startsWith('fill=') && !x.startsWith('fill-opacity')).concat(rp) }
          return `<text ${aa.join(' ')} x="${f(p.x)}" y="${f(p.y)}" ${fontAttrs(p.cs)}>${esc(p.s)}</text>`
        }).join('')
      }
      return stroke ? mk(true, false) + mk(false, true) : mk(false, false)
    }
    const runPaint = (rcs) => { const c = parseColor(rcs.fill); return c ? fillAttr(c) : '' }
    const expandPattern = (el, pat, attrs) => {
      // tile the pattern's children over the shape's bbox, clipped to the shape
      const pw = pat.width.baseVal.value, ph = pat.height.baseVal.value
      const bb = el.getBBox()
      const ptf = pat.patternTransform.baseVal.consolidate()
      const PM = ptf ? ptf.matrix : new DOMMatrix()
      const inv = DOMMatrix.fromMatrix(PM).inverse()
      const corners = [[bb.x, bb.y], [bb.x + bb.width, bb.y], [bb.x, bb.y + bb.height], [bb.x + bb.width, bb.y + bb.height]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(inv))
      const x0 = Math.floor(Math.min(...corners.map((p) => p.x)) / pw) * pw, x1 = Math.max(...corners.map((p) => p.x))
      const y0 = Math.floor(Math.min(...corners.map((p) => p.y)) / ph) * ph, y1 = Math.max(...corners.map((p) => p.y))
      const tile = [...pat.children].map(walk).join('')
      let tiles = ''
      for (let y = y0; y < y1; y += ph) for (let x = x0; x < x1; x += pw) tiles += `<g transform="translate(${f(x)} ${f(y)})">${tile}</g>`
      const id = nid('pclip')
      const shapeAttrs = [...el.attributes].filter((a) => !['class', 'style', 'fill', 'stroke'].includes(a.name) && !a.name.startsWith('stroke')).map((a) => `${a.name}="${esc(a.value)}"`).join(' ')
      clipDefs.set(id, `<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><${el.tagName} ${shapeAttrs}/></clipPath>`)
      // the clip is defined in the shape's own user space; the expanded group sits in the same space
      return `<g clip-path="url(#${id})"><g transform="${PM.isIdentity ? '' : mstr(PM)}">${tiles}</g></g>`
    }
    const kids = [...svg.children].map(walk).join('')
    let body = `<g transform="${mstr(T) || 'translate(0 0)'}">${kids}</g>`
    if (cs.overflow !== 'visible' && cs.overflowX !== 'visible') {
      const id = nid('clip')
      clipDefs.set(id, `<clipPath id="${id}"><rect x="${f(r.x + bl)}" y="${f(r.y + bt)}" width="${f(cw)}" height="${f(ch)}"/></clipPath>`)
      body = `<g clip-path="url(#${id})">${body}</g>`
    }
    push(body, ctx)
  }

  // ---------- painting order (simplified CSS stacking) ----------
  const isPositioned = (cs) => cs.position !== 'static'
  const zOf = (cs) => (cs.zIndex === 'auto' ? null : parseInt(cs.zIndex))
  const makesContext = (e) => {
    const i = info.get(e), cs = i.cs
    return (isPositioned(cs) && zOf(cs) !== null) || i.local || parseFloat(cs.opacity) < 1 || cs.isolation === 'isolate' || (cs.display === 'flex' || cs.display === 'grid' ? false : false)
  }
  const flexItemZ = (e) => { const p = e.parentElement; if (!p) return false; const d = info.get(p)?.cs.display; return (d === 'flex' || d === 'inline-flex' || d === 'grid') && zOf(info.get(e).cs) !== null }

  // paint element e "atomically" (its own box + descendants), honouring z-order among positioned descendants
  function paintAtomic(e, ctx) {
    const i = info.get(e)
    if (!i || i.cs.display === 'none') return
    const cs = i.cs
    const op = ctx.op * parseFloat(cs.opacity)
    let clips = ctx.clips
    const prevGroup = curGroup
    if (e.dataset && e.dataset.panel !== undefined && !curGroup) curGroup = groupName(e)
    else if (e.parentElement && e.parentElement.parentElement === posterEl && !curGroup) curGroup = groupName(e)
    const my = { M: i.M, clips, op }
    // collect layers among descendants that don't form their own context deeper
    const neg = [], normal = [], pos = []
    if (cs.visibility === 'visible' && e !== posterEl) {
      if (e instanceof SVGSVGElement) { paintBox(e, i, my, [i.r]); paintSvg(e, i, my); curGroup = prevGroup; return }
      if (cs.display === 'inline') paintBox(e, i, my, [...e.getClientRects()].map((q) => ({ x: q.left - pr.left, y: q.top - pr.top, w: q.width, h: q.height })))
      else if (cs.display !== 'contents') paintBox(e, i, my, [i.r])
      if (e.tagName === 'IMG') { paintImg(e, i, my); curGroup = prevGroup; return }
    }
    // clip for descendants
    if (e !== posterEl && e.parentElement !== posterEl && (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') && cs.display !== 'contents') {
      const id = nid('clip')
      const bl = px(cs.borderLeftWidth), bt = px(cs.borderTopWidth)
      const r = i.r, { rx, ry } = radiusOf(cs, r)
      clipDefs.set(id, `<clipPath id="${id}">${rectSvg(r.x + bl, r.y + bt, r.w - bl - px(cs.borderRightWidth), r.h - bt - px(cs.borderBottomWidth), Math.max(0, rx - bl), Math.max(0, ry - bt), `transform="${mstr(i.M) || 'translate(0 0)'}"`)}</clipPath>`)
      clips = [...clips, id]
    }
    const childCtx = { clips, op }
    const visitKids = (p) => {
      for (const c of p.childNodes) {
        if (c.nodeType === 3) { if (c.data.trim()) normal.push({ text: c }) ; continue }
        if (c.nodeType !== 1) continue
        const ci = info.get(c)
        if (!ci || ci.cs.display === 'none') continue
        const z = zOf(ci.cs)
        if (makesContext(c) || flexItemZ(c) || isPositioned(ci.cs)) { const zz = z ?? 0; (zz < 0 ? neg : pos).push({ el: c, z: zz }) }
        else normal.push({ el: c, flow: true })
      }
    }
    visitKids(e)
    neg.sort((a, b) => a.z - b.z)
    const posSorted = pos.map((p, k) => ({ ...p, k })).sort((a, b) => a.z - b.z || a.k - b.k)
    for (const it of neg) paintAtomic(it.el, { ...childCtx })
    for (const it of normal) {
      if (it.text) { if (cs.visibility === 'visible' || true) paintText(it.text, { M: i.M, clips, op }) }
      else paintAtomic(it.el, { ...childCtx })
    }
    for (const it of posSorted) paintAtomic(it.el, { ...childCtx })
    curGroup = prevGroup
  }
  const groupName = (e) => {
    if (e.dataset.panel !== undefined) {
      const lab = e.querySelector('div,span')
      const t = (e.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean)
      return `card ${e.dataset.panel}` + (t.length ? ` – ${t.find((s) => !/^\d+$/.test(s) && s.length > 3) || ''}` : '')
    }
    if (e.tagName.toLowerCase() === 'svg') return zOf(info.get(e).cs) > 0 ? 'leader line nodes' : 'leader lines'
    if (e.querySelector('[class*="font-display"]')) return 'title card'
    if (e.querySelector('img') && !(e.innerText || '').trim()) return 'logos'
    const t = (e.innerText || '').trim().split('\n')[0]
    return t ? t.slice(0, 40) : e.tagName.toLowerCase()
  }
  // the poster root: its own background is the canvas
  const posterRoot = posterEl.firstElementChild
  {
    const i = info.get(posterRoot)
    curGroup = 'background'
    paintBox(posterRoot, i, { M: i.M, clips: [], op: 1 }, [i.r])
    curGroup = null
  }
  // paint children of the poster root (it is position:relative, z auto)
  {
    const fake = { M: new DOMMatrix(), clips: [], op: 1 }
    const i = info.get(posterRoot)
    const neg = [], normal = [], pos = []
    for (const c of posterRoot.children) {
      const ci = info.get(c); if (!ci || ci.cs.display === 'none') continue
      const z = zOf(ci.cs) ?? 0
      ;(z < 0 ? neg : isPositioned(ci.cs) || ci.local ? pos : normal).push({ el: c, z })
    }
    const order = [...neg.sort((a, b) => a.z - b.z), ...normal, ...pos.map((p, k) => ({ ...p, k })).sort((a, b) => a.z - b.z || a.k - b.k)]
    order.forEach(({ el }, k) => {
      curGroup = null
      const nm = !el.children.length && !el.textContent.trim() ? (k < order.length / 2 ? 'background' : 'poster border') : groupName(el)
      curGroup = nm
      paintAtomic(el, fake)
    })
  }

  // ---------- restore page ----------
  for (const e of htmlEls) { const i = info.get(e); e.style.cssText = i.inlineT }

  // ---------- serialize, grouping consecutive prims by (group, clips, matrix, opacity) ----------
  const out = []
  let open = null
  const keyOf = (p) => `${p.group}|${p.clips.join(',')}|${mstr(p.M)}|${p.op}`
  let gOpen = null, cOpen = null, mOpen = null
  const closeM = () => { if (mOpen !== null) { out.push('</g>'); mOpen = null } }
  const closeC = () => { closeM(); if (cOpen !== null) { out.push('</g>'.repeat(cOpen.length || 0)); cOpen = null } }
  const closeG = () => { closeC(); if (gOpen !== null) { out.push('</g>'); gOpen = null } }
  for (const p of prims) {
    const g = p.group || 'misc'
    if (g !== gOpen) { closeG(); out.push(`<g id="${esc(g.replace(/\s+/g, ' ').slice(0, 80))}">`); gOpen = g }
    const ck = p.clips.join(',')
    if (cOpen === null || ck !== cOpen.join(',')) { closeC(); cOpen = p.clips; for (const c of p.clips) out.push(`<g clip-path="url(#${c})">`) }
    const mk = mstr(p.M) + '|' + p.op
    if (mk !== mOpen) { closeM(); out.push(`<g${mstr(p.M) ? ` transform="${mstr(p.M)}"` : ''}${p.op < 1 ? ` opacity="${f(p.op)}"` : ''}>`); mOpen = mk }
    out.push(p.svg)
  }
  closeG()
  const defs = [...clipDefs.values()].join('\n')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n<defs>\n${defs}\n</defs>\n${out.join('\n')}\n</svg>\n`
  return { svg, W, H, warn: [...new Set(warn)], rasterJobs, svgAssets: [...svgAssets], nPrims: prims.length, offset: { x: pr.left + scrollX, y: pr.top + scrollY }, faces: Object.fromEntries(Object.entries(faces).map(([k, v]) => [k, [...v]])) }
}

// isolate one element's background for a raster capture (everything else hidden, own text/border/shadow off)
window.__figmaIsolate = function (id) {
  const st = document.createElement('style')
  st.id = '__figiso'
  st.textContent = `#poster, #poster * { transform: none !important; translate: none !important; rotate: none !important; scale: none !important; } #poster *, #poster { visibility: hidden !important; } [data-fig-raster="${id}"] { visibility: visible !important; color: transparent !important; border-color: transparent !important; box-shadow: none !important; background-color: transparent !important; outline: none !important; } [data-fig-raster="${id}"] * { visibility: hidden !important; } html, body, #root, #root > div, #root > div > div { background: transparent !important; box-shadow: none !important; }`
  document.head.appendChild(st)
}
window.__figmaRestore = function () { document.getElementById('__figiso')?.remove() }
