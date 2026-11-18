import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import PosterV1CorkboardComic from './versions/PosterV1CorkboardComic'

/* =====================================================================
   Poster v2 – "Annotation workspace"
   The poster looks like the thing the paper is about: annotation.
   Every block is an annotated region – its label says which part of the
   paper it carries (Context / Method / Results / Takeaway) and its colour
   follows that role. The five paper attributes appear once, as a legend.
   Leader lines tie every block to the title box.
   (v1 – cork board + comic panels – is kept in src/versions and shown
   with  ?v=1  in the URL.)
   ===================================================================== */

/* ---------- Poster geometry (CSS px, exact target size) ---------- */
const W = 19876
const H = 12600
/* Look (default = classic): gray cards with ink borders on a light gray canvas.
   ?bg=gray -> gray bbox cards on a colourful canvas, ?bg=white -> white canvas + role-tinted cards,
   ?bg=color -> colourful canvas + clean cream cards */
const MODE = new URLSearchParams(window.location.search).get('bg')
const BG_MODE: 'classic' | 'white' | 'color' | 'gray' = MODE === 'color' ? 'color' : MODE === 'white' ? 'white' : MODE === 'gray' ? 'gray' : 'classic'
const CANVAS_PARAM = new URLSearchParams(window.location.search).get('canvas')
const CANVAS = CANVAS_PARAM ? `#${CANVAS_PARAM}` : BG_MODE === 'classic' ? '#ffffff' : BG_MODE === 'white' ? '#f6f4ee' : '#e8d9a8'
const BORDER = BG_MODE === 'gray' ? 34 : 18
const TITLE = { x: W / 2, y: 2620 }

/* Panel rectangles [x, y, w, h]. Top band: problem + contributions | task + attributes | title | link + numbers. Below: a loose, overlapping pile. */
const R = {
  // top band (shorter than before so the results pile gets more room)
  A: [320, 320, 3084, 720],
  D: [320, 1300, 3084, 720],
  C: [320, 2280, 3084, 1940],
  A2: [3664, 320, 2616, 3900],
  QR: [13600, 320, 5956, 2000],
  B: [13600, 2580, 2200, 1640],
  B2: [16060, 2580, 3496, 1640],
  // results pile: bigger, overlapping, rotated (later entries lie on top)
  M1: [380, 4560, 4400, 3900],
  M2: [4900, 5100, 3300, 2900],
  M3: [8500, 5100, 3900, 4100],
  M4: [12500, 5100, 3400, 2800],
  M5: [16100, 4620, 3400, 4200],
  M6: [380, 8750, 3500, 3530],
  M7: [4000, 8450, 3600, 3830],
  M8: [7750, 9350, 4300, 2930],
  M9: [12550, 7950, 3500, 4330],
  M10: [16150, 9150, 3400, 3130],
} as const satisfies Record<string, readonly [number, number, number, number]>
type PanelId = keyof typeof R

/* Extra rotation (deg) for the scattered pile */
const ROT: Partial<Record<PanelId, number>> = {
  M1: -2.5, M2: 3, M3: -2, M4: 3.5, M5: -2.5,
  M6: 2, M7: -3, M8: 2, M9: -2.5, M10: 3,
}

const INK = '#141414'
const RED = '#e0412f'

/* Role of a block in the story -> label prefix + colour */
type Group = 'context' | 'method' | 'results' | 'takeaway' | 'link'
const GROUP: Record<Group, { name: string; color: string }> = {
  context: { name: 'Context', color: '#2f6fe0' },
  method: { name: 'Method', color: '#2aa876' },
  results: { name: 'Results', color: '#f08a24' },
  takeaway: { name: 'Takeaway', color: '#8a4fd8' },
  link: { name: 'Data', color: '#14a3b8' },
}

type Variant = 'gray' | 'flat' | 'yellow' | 'white' | 'dark'

/* What each block is for. Numbers are reading order; hint = which part of the paper fits here. */
const META: Record<PanelId, { n: number | string; title: string; group: Group; hint?: string; variant?: Variant }> = {
  A: { n: 1, title: 'Problem', group: 'context', hint: 'ImageNet-1k validation labels: single-label, noisy, from 2012' },
  B: { n: 5, title: 'Prior reannotations', group: 'context', hint: 'ReaL · Multilabel · ImageNetMultiLabel · Label Errors' },
  C: { n: 3, title: 'Image splits', group: 'method', variant: 'flat' },
  D: { n: 2, title: 'Contributions', group: 'context', hint: 'ReImageNet · evaluation · derived benchmarks · guidance' },
  QR: { n: 'LINK', title: 'Dataset and annotation tool', group: 'link', variant: 'white' },
  A2: { n: 4, title: 'Attributes', group: 'method', variant: 'white' },
  B2: { n: 6, title: 'Key numbers', group: 'results', variant: 'yellow' },
  M1: { n: 7, title: 'Annotation pipeline', group: 'method', hint: 'Train annotators → class groups → per-image labels → verification' },
  M2: { n: 8, title: 'ImGT vs ReGT', group: 'results', variant: 'dark', hint: 'Fig. 1: original label vs new multilabel boxes' },
  M3: { n: 9, title: 'Label statistics', group: 'results', hint: 'Fig. 4: single-label / multilabel / no-class split of 50,000 images' },
  M4: { n: 10, title: 'Accuracy on ReGT', group: 'results', hint: 'Tab. 1: MLLMs vs VLMs vs supervised models' },
  M5: { n: 11, title: 'Attribute analysis', group: 'results', hint: 'Tab. 2: crowd · reflection · rendition · text-recognition' },
  M6: { n: 12, title: 'Object crops', group: 'results', hint: 'Tab. 3: All · Largest · Any · ExCrops' },
  M7: { n: 13, title: 'Small objects', group: 'method', variant: 'dark', hint: 'Fig. 3: zoomed-in crops that need context' },
  M8: { n: 14, title: 'Derived benchmarks', group: 'results', hint: 'Tab. 4: error propagation to ImageNetV2, -A, -R, -Sketch, ObjectNet, CounterAnimal' },
  M9: { n: 15, title: 'Limitations', group: 'takeaway', hint: 'European annotators · validation set only · closed MLLMs' },
  M10: { n: 16, title: 'Take-aways', group: 'takeaway', hint: 'Annotate iteratively; human + MLLM beats either alone' },
}

const tiltFor = (n: number) => ({
  rz: Math.sin(n * 2.1) * 0.7,
  skx: Math.sin(n * 1.3) * 0.4,
  sky: Math.cos(n * 1.7) * 0.25,
})

/* ---------- Primitives ---------- */

/* Reading-order chip, top-right of every block */
function Index({ n }: { n: number | string }) {
  return (
    <div
      className="absolute z-20 bg-ink font-mono font-semibold text-paper"
      style={{ top: 50, right: 50, padding: '26px 56px', fontSize: 100, letterSpacing: 4, borderRadius: 24 }}
    >
      {typeof n === 'number' ? `#${String(n).padStart(2, '0')}` : n}
    </div>
  )
}

/* Role + section name, on the top-left edge like a bbox label */
function Label({ group, children }: { group: Group; children: ReactNode }) {
  return (
    <div
      className="absolute z-10 whitespace-nowrap font-mono font-semibold text-white"
      style={{ left: -BORDER, top: -150 - BORDER, background: GROUP[group].color, padding: '26px 70px 22px 56px', fontSize: 92, letterSpacing: 3, lineHeight: 1.1 }}
    >
      <span className="opacity-80">{GROUP[group].name}</span>
      <span className="opacity-60"> · </span>
      {children}
    </div>
  )
}

/* Bounding-box corner handle (the block itself is the annotated object) */
function Corner({ color, x, y }: { color: string; x: 'l' | 'r'; y: 't' | 'b' }) {
  const hs = 76
  const off = -BORDER - hs / 2
  return (
    <div
      className="absolute z-30"
      style={{ width: hs, height: hs, background: '#fff', border: `16px solid ${color}`, boxSizing: 'border-box', [x === 'l' ? 'left' : 'right']: off, [y === 't' ? 'top' : 'bottom']: off }}
    />
  )
}

/* Placeholder slot that says which part of the paper belongs here */
function Slot({ children, light }: { children: ReactNode; light?: boolean }) {
  return (
    <div
      className="absolute flex items-center justify-center text-center font-mono"
      style={{
        inset: '300px 150px 150px 150px',
        border: `10px dashed ${light ? 'rgba(255,255,255,0.7)' : 'rgba(20,20,20,0.35)'}`,
        color: light ? 'rgba(255,255,255,0.95)' : 'rgba(20,20,20,0.6)',
        fontSize: 96,
        lineHeight: 1.35,
        letterSpacing: 2,
        padding: 120,
      }}
    >
      {children}
    </div>
  )
}

const TINT: Record<Group, string> = { context: '#cfe0fb', method: '#c6ecdb', results: '#fcdcb8', takeaway: '#e2d3f6', link: '#ffffff' }
const hatch = (a: string, b: string) => `repeating-linear-gradient(45deg, ${a} 0 36px, ${b} 36px 72px)`

function cardBg(group: Group, variant: Variant): string {
  if (variant === 'flat') return '#e0ddd3' // same gray as the hatched cards, without the stripes
  if (BG_MODE === 'classic') {
    if (variant === 'white') return '#ffffff'
    if (variant === 'yellow') return '#f4d85a'
    return variant === 'dark' ? hatch('#2c2a28', '#262422') : hatch('#e3e0d7', '#dcd9cf')
  }
  if (BG_MODE === 'gray') {
    if (variant === 'white' || variant === 'yellow') return '#ffffff'
    return variant === 'dark' ? hatch('#a9a498', '#a09b8f') : hatch('#dcd8cc', '#d4d0c3')
  }
  if (variant === 'white') return '#ffffff'
  if (variant === 'yellow') return BG_MODE === 'color' ? '#ffffff' : '#f4d85a'
  // 'dark' = figure / image slot: full role colour so it reads as the "picture" of the block
  if (variant === 'dark') return hatch(GROUP[group].color, `color-mix(in srgb, ${GROUP[group].color} 90%, black)`)
  // white canvas: catchy role-tinted cards. coloured canvas: clean paper cards.
  return BG_MODE === 'color' ? hatch('#fbf8f0', '#f4f0e6') : hatch(TINT[group], `color-mix(in srgb, ${TINT[group]} 88%, white)`)
}

/* QR code: transparent vector modules, tinted with `color` through a mask, so no background box is drawn.
   The logo sits over the cleared centre. */
const asset = (name: string) => `${import.meta.env.BASE_URL}assets/${name}`

function QrCode({ qr, logo, size, color = INK }: { qr: string; logo: string; size: number; color?: string }) {
  const mask = `url(${asset(qr)})`
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0"
        style={{ background: color, WebkitMaskImage: mask, maskImage: mask, WebkitMaskSize: '100% 100%', maskSize: '100% 100%', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat' }}
      />
      <img src={asset(logo)} alt="" className="absolute" style={{ left: '38.4%', top: '38.4%', width: '23.2%', height: '23.2%' }} />
    </div>
  )
}

/* One half of the link panel: QR + what it is on top, the link on a single line below */
function LinkColumn({ side, kicker, title, qr, logo, link }: { side: 'left' | 'right'; kicker: string; title: string; qr: string; logo: string; link: string }) {
  return (
    <div className="absolute inset-y-0 flex flex-col justify-center" style={{ [side]: 0, width: '50%', padding: '0 130px', gap: 130 }}>
      <div className="flex items-center" style={{ gap: 100 }}>
        <QrCode qr={qr} logo={logo} size={1150} />
        <div style={{ width: 1500 }}>
          <div
            className="inline-block font-mono font-semibold uppercase text-white"
            style={{ fontSize: 100, letterSpacing: 10, lineHeight: 1.1, background: GROUP.link.color, padding: '26px 70px 22px 56px' }}
          >
            {kicker}
          </div>
          <div className="font-body font-bold text-ink" style={{ fontSize: 190, lineHeight: 1.05, marginTop: 50 }}>
            {title}
          </div>
        </div>
      </div>
      <div className="font-mono font-semibold text-ink" style={{ fontSize: 100, whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
        {link}
      </div>
    </div>
  )
}

/* The paper's five attributes: colour code + short definitions */
const ATTR = { rendition: '#f7763d', crowd: '#8746ae', text: '#9a9a9a', reflection: '#3dbfb8', dominant: '#b84041' } // box colours from the paper's Fig. 2

function AttrChip2({ color, children }: { color: string; children: ReactNode }) {
  return (
    <div className="inline-block whitespace-nowrap font-mono font-semibold text-white" style={{ background: color, padding: '16px 46px 12px 34px', fontSize: 76, lineHeight: 1.1, letterSpacing: 3 }}>
      {children}
    </div>
  )
}

/* Example image from the paper (no frame: it already carries the paper's own boxes), optional caption below */
function ExampleImg({ src, height, tag }: { src: string; height: number; tag?: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center" style={{ gap: 12 }}>
      <img src={asset(src)} alt="" className="block" style={{ height, width: 'auto' }} />
      {tag && (
        <div className="font-mono font-semibold text-ink" style={{ fontSize: 64 }}>
          {tag}
        </div>
      )}
    </div>
  )
}

/* attribute label sitting right on top of its description */
function AttrNote({ name, color, text }: { name: string; color: string; text: string }) {
  return (
    <div className="flex flex-col items-start" style={{ gap: 12 }}>
      <AttrChip2 color={color}>{name}</AttrChip2>
      <div className="font-body font-semibold text-ink" style={{ fontSize: 74, lineHeight: 1.12 }}>
        {text}
      </div>
    </div>
  )
}

function AttrCell({ name, color, src, text, pos = 'center' }: { name: string; color: string; src: string; text: string; pos?: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 18 }}>
      <div style={{ aspectRatio: '4 / 3', overflow: 'hidden' }}>
        <img src={asset(src)} alt="" className="block h-full w-full" style={{ objectFit: 'cover', objectPosition: pos }} />
      </div>
      <AttrNote name={name} color={color} text={text} />
    </div>
  )
}

/* ---------- Image splits (the paper's Fig. 4 as a left-to-right tree) ---------- */
const TREE = { w: 2848, row: 262, gap: 36 }
const TREE_H = 5 * TREE.row + 4 * TREE.gap
const rowY = (r: number) => r * (TREE.row + TREE.gap)
const COL = { a: { x: 0, w: 460 }, b: { x: 550, w: 830 }, c: { x: 1470, w: 1378 } }
// semi-transparent tints (as in the paper): poster green = Method role colour, poster red = RED
const TONE = { grey: 'rgba(255,255,255,0.6)', green: 'rgba(42,168,118,0.34)', red: 'rgba(224,65,47,0.30)' }

type TreeNode = { key: string; col: 'a' | 'b' | 'c'; y: number; h: number; tone: keyof typeof TONE; code: string; pct: string; desc: string }
const TREE_NODES: TreeNode[] = [
  { key: 'A', col: 'a', y: TREE_H / 2 - 150, h: 300, tone: 'grey', code: 'A', pct: '100%', desc: 'all images' },
  { key: 'S', col: 'b', y: rowY(0), h: 2 * TREE.row + TREE.gap, tone: 'grey', code: 'S', pct: '64.1%', desc: 'one ReGT label' },
  { key: 'N', col: 'b', y: rowY(2), h: TREE.row, tone: 'grey', code: 'N', pct: '4.0%', desc: 'no ImageNet-1k object' },
  { key: 'M', col: 'b', y: rowY(3), h: 2 * TREE.row + TREE.gap, tone: 'grey', code: 'M', pct: '31.9%', desc: 'several ReGT labels' },
  { key: 'S+', col: 'c', y: rowY(0), h: TREE.row, tone: 'green', code: 'S+', pct: '58.4%', desc: 'ImGT label is the ReGT label' },
  { key: 'S−', col: 'c', y: rowY(1), h: TREE.row, tone: 'red', code: 'S−', pct: '5.6%', desc: 'ImGT label is not the ReGT label' },
  { key: 'M+', col: 'c', y: rowY(3), h: TREE.row, tone: 'green', code: 'M+', pct: '29.4%', desc: 'ImGT label is among the ReGT labels' },
  { key: 'M−', col: 'c', y: rowY(4), h: TREE.row, tone: 'red', code: 'M−', pct: '2.5%', desc: 'ImGT label is not among the ReGT labels' },
]
const nodeByKey = (k: string) => TREE_NODES.find((n) => n.key === k)!
const TREE_EDGES: [string, string][] = [['A', 'S'], ['A', 'N'], ['A', 'M'], ['S', 'S+'], ['S', 'S−'], ['M', 'M+'], ['M', 'M−']]

function SplitsTree() {
  const edge = ([pk, ck]: [string, string]) => {
    const p = nodeByKey(pk)
    const c = nodeByKey(ck)
    const x1 = COL[p.col].x + COL[p.col].w
    const x2 = COL[c.col].x
    const y1 = p.y + p.h / 2
    const y2 = c.y + c.h / 2
    const mid = (x1 + x2) / 2
    return `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`
  }
  return (
    <div className="absolute" style={{ left: 100, top: 250, width: TREE.w, height: TREE_H }}>
      <svg className="absolute inset-0" width={TREE.w} height={TREE_H} style={{ overflow: 'visible' }}>
        {TREE_EDGES.map((e) => (
          <path key={e.join()} d={edge(e)} fill="none" stroke={INK} strokeWidth={10} />
        ))}
      </svg>
      {TREE_NODES.map((n) => (
        <div
          key={n.key}
          className="absolute flex flex-col justify-center"
          style={{ left: COL[n.col].x, top: n.y, width: COL[n.col].w, height: n.h, background: TONE[n.tone], border: `10px solid ${INK}`, padding: '0 34px', boxSizing: 'border-box' }}
        >
          <div className="flex items-baseline whitespace-nowrap" style={{ gap: 26, lineHeight: 1 }}>
            <span className="font-mono font-bold text-ink" style={{ fontSize: 92 }}>
              {n.code}
            </span>
            <span className="font-body font-bold text-ink" style={{ fontSize: 100 }}>
              {n.pct}
            </span>
          </div>
          <div className="font-body font-semibold text-ink" style={{ fontSize: 54, lineHeight: 1.1, marginTop: 14 }}>
            {n.desc}
          </div>
        </div>
      ))}
      {/* legend: what + / - mean */}
      <div className="absolute flex items-center whitespace-nowrap font-body font-semibold text-ink" style={{ left: 0, top: TREE_H + 50, gap: 110, fontSize: 60 }}>
        <span className="flex items-center" style={{ gap: 24 }}>
          <span style={{ width: 64, height: 64, background: TONE.green, border: `8px solid ${INK}` }} />+ ImGT label agrees with ReGT
        </span>
        <span className="flex items-center" style={{ gap: 24 }}>
          <span style={{ width: 64, height: 64, background: TONE.red, border: `8px solid ${INK}` }} />− disagrees
        </span>
      </div>
    </div>
  )
}

function Panel({ id, children }: { id: PanelId; children?: ReactNode }) {
  const [x, y, w, h] = R[id]
  const m = META[id]
  const color = GROUP[m.group].color
  const variant = m.variant ?? 'gray'
  const nn = typeof m.n === 'number' ? m.n : 5
  const t = tiltFor(nn)
  const rz = ROT[id] ?? t.rz
  return (
    <section
      className="absolute"
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        background: cardBg(m.group, variant),
        border: `${BORDER}px solid ${BG_MODE === 'gray' ? color : INK}`,
        boxSizing: 'border-box',
        boxShadow: BG_MODE === 'gray' ? '0 0 0 12px #141414, 26px 26px 0 12px #141414' : '26px 26px 0 #141414',
        transform: `rotate(${rz}deg) skew(${t.skx}deg, ${t.sky}deg)`,
      }}
      data-panel={m.n}
    >
      <Label group={m.group}>{m.title}</Label>
      <Index n={m.n} />
      <Corner color={color} x="r" y="t" />
      <Corner color={color} x="l" y="b" />
      <Corner color={color} x="r" y="b" />
      {children ?? (m.hint && <Slot light={variant === 'dark' && BG_MODE !== 'gray'}>{m.hint}</Slot>)}
    </section>
  )
}

/* ---------- Title card: annotated object ---------- */
const BOX_W = 6700
const BOX_H = 4600
const BOX = { l: 60, r: 60, t: 190, b: 230 }
const TITLE_ROT = -1.2
const LOGO_H = 380 // credential logos, bottom right of the title card
const LOGO_STRIP = 440 // space reserved for them at the bottom of the card
const LOGO_GAP = 507 // gap between the logos (centred row)
const LOGO_LIFT = 210 // lifts the row off the bottom edge of the card

function Handle({ style }: { style: CSSProperties }) {
  return <div className="absolute" style={{ width: 140, height: 140, marginLeft: -70, marginTop: -70, background: '#fff', border: `36px solid ${RED}`, boxSizing: 'border-box', ...style }} />
}

function AttrChip({ label, checked = true }: { label: string; checked?: boolean }) {
  return (
    <div className="flex items-center whitespace-nowrap bg-white font-mono font-semibold text-ink" style={{ border: '20px solid #141414', padding: '18px 60px 18px 40px', fontSize: 96, gap: 40 }}>
      <span className="inline-flex items-center justify-center" style={{ width: 90, height: 90, border: '16px solid #141414', background: checked ? RED : '#fff', color: '#fff', fontSize: 80, lineHeight: 1 }}>
        {checked ? '✓' : ''}
      </span>
      {label}
    </div>
  )
}

/* Text that scales itself so its natural width equals `target` px (capped by `max`).
   Measures the real loaded font, so it fills the card whichever font is in use. */
function FitLine({ children, target, max, className, style }: { children: string; target: number; max: number; className?: string; style?: CSSProperties }) {
  const probe = useRef<HTMLSpanElement>(null)
  const [size, setSize] = useState(max)
  useLayoutEffect(() => {
    const run = () => {
      const el = probe.current
      if (!el || !el.offsetWidth) return
      setSize(Math.min(max, (400 * target) / el.offsetWidth)) // probe is measured at 400px
    }
    run()
    document.fonts?.ready.then(run)
    document.fonts?.addEventListener('loadingdone', run)
    return () => document.fonts?.removeEventListener('loadingdone', run)
  }, [target, max, children])
  return (
    <div className={className} style={{ whiteSpace: 'nowrap', fontSize: size, ...style }}>
      <span ref={probe} aria-hidden style={{ position: 'absolute', visibility: 'hidden', fontSize: 400, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
        {children}
      </span>
      {children}
    </div>
  )
}

const CONTENT_W = BOX_W - BOX.l - BOX.r - 172 // inner width of the title card

function TitleBlock() {
  const boxW = BOX_W - BOX.l - BOX.r
  const boxH = BOX_H - BOX.t - BOX.b
  const hx = [0, boxW / 2, boxW]
  const hy = [0, boxH / 2, boxH]
  return (
    <section
      className="absolute"
      style={{ left: TITLE.x - BOX_W / 2, top: TITLE.y - BOX_H / 2, width: BOX_W, height: BOX_H, zIndex: 28, transform: `rotate(${TITLE_ROT}deg)` }}
    >
      <div
        className="absolute"
        style={{ left: BOX.l + 50, right: BOX.r + 50, top: BOX.t + 50, bottom: BOX.b + 50, background: '#f4efe6', border: '36px solid #141414', boxShadow: '30px 30px 0 #141414' }}
      />
      <div className="absolute" style={{ left: BOX.l, top: BOX.t, width: boxW, height: boxH, border: `40px solid ${RED}`, boxSizing: 'border-box' }}>
        {hx.flatMap((x, i) => hy.map((y, j) => (i === 1 && j === 1 ? null : <Handle key={`${i}${j}`} style={{ left: x, top: y }} />)))}
      </div>
      <div className="absolute whitespace-nowrap font-mono font-semibold text-white" style={{ left: BOX.l - 12, top: 20, background: RED, padding: '30px 90px 24px 70px', fontSize: 110, letterSpacing: 4 }}>
        ReGT: ReImageNet
      </div>
      <div className="absolute flex" style={{ left: BOX.l, bottom: 20, gap: 60 }}>
        <AttrChip label="multilabel" />
        <AttrChip label="boxes" />
        <AttrChip label="revised classes" />
        <AttrChip label="attributes" />
      </div>

      <div className="absolute flex flex-col items-center justify-center text-center" style={{ left: BOX.l + 86, right: BOX.r + 86, top: BOX.t + 86, bottom: BOX.b + 86 + LOGO_STRIP }}>
        <div className="font-mono font-semibold uppercase text-ink" style={{ fontSize: 92, letterSpacing: 26, whiteSpace: 'nowrap', marginBottom: 180 }}>
          NeurIPS 2026 · Spotlight
        </div>
        <FitLine
          target={CONTENT_W - 1000}
          max={640}
          className="font-display text-ink"
          style={{ lineHeight: 0.95, transform: 'skewX(-8deg)', marginTop: 30, letterSpacing: '0.01em' }}
        >
          DOOMED TO RE-ANNOTATE,
        </FitLine>
        <FitLine
          target={CONTENT_W - 2300}
          max={880}
          className="font-display"
          style={{ color: RED, lineHeight: 0.92, transform: 'skewX(-8deg) rotate(-1.5deg)', letterSpacing: '0.01em' }}
        >
          FOREVER!
        </FitLine>
        <div className="bg-ink font-display italic text-comic-yellow" style={{ padding: '30px 140px 10px', marginTop: 40, transform: 'skewX(-6deg) rotate(-1deg)' }}>
          <FitLine target={CONTENT_W - 700} max={400} style={{ lineHeight: 1, letterSpacing: '0.015em' }}>
            The ImageNet Story
          </FitLine>
        </div>
        <FitLine target={CONTENT_W - 450} max={150} className="font-mono font-semibold text-ink" style={{ marginTop: 250, lineHeight: 1.3 }}>
          Illia Volkov · Nikita Kisel · Tetiana Mishkina · Klara Janouskova · Jiri Matas
        </FitLine>
        <FitLine target={CONTENT_W - 700} max={112} className="font-mono text-ink/80" style={{ marginTop: 40, lineHeight: 1.3 }}>
          Visual Recognition Group · Czech Technical University in Prague
        </FitLine>
      </div>
      {/* credentials, bottom centre: VRG, CTU, NeurIPS – the CTU logo sits on the card's centre axis */}
      <div
        className="absolute grid items-center"
        style={{ left: BOX.l + 86, right: BOX.r + 86, bottom: BOX.b + 86 + LOGO_LIFT, height: LOGO_H, gridTemplateColumns: '1fr auto 1fr', columnGap: LOGO_GAP }}
      >
        <img src={asset('logo-vrg-full.png')} alt="Visual Recognition Group" className="justify-self-end" style={{ height: LOGO_H, width: 'auto' }} />
        <img src={asset('logo-ctu.svg')} alt="Czech Technical University in Prague" style={{ height: LOGO_H, width: 'auto' }} />
        <img src={asset('logo-neurips.png')} alt="NeurIPS" className="justify-self-start" style={{ height: LOGO_H, width: 'auto' }} />
      </div>
    </section>
  )
}

/* ---------- Yarn: from the title card to every panel, laid UNDER the panels (visible only in the gaps) ---------- */
type Pt = { x: number; y: number }

function rotAround(p: Pt, c: Pt, deg: number): Pt {
  const th = (deg * Math.PI) / 180
  const dx = p.x - c.x
  const dy = p.y - c.y
  return { x: c.x + dx * Math.cos(th) - dy * Math.sin(th), y: c.y + dx * Math.sin(th) + dy * Math.cos(th) }
}

// where the line from the title meets the panel's (rotated) border – the node sits there
function edgeNode(id: PanelId): Pt {
  const [x, y, w, h] = R[id]
  const c = { x: x + w / 2, y: y + h / 2 }
  const rot = ROT[id] ?? 0
  const d = rotAround(TITLE, c, -rot)
  const dx = d.x - c.x
  const dy = d.y - c.y
  const t = Math.min(dx ? w / 2 / Math.abs(dx) : Infinity, dy ? h / 2 / Math.abs(dy) : Infinity)
  return rotAround({ x: c.x + dx * t, y: c.y + dy * t }, c, rot)
}

const LINKS = (Object.keys(R) as PanelId[]).map((id) => ({ id, p: edgeNode(id), color: GROUP[META[id].group].color }))

/* below the panels */
function Links() {
  return (
    <svg className="absolute inset-0" width={W} height={H} style={{ pointerEvents: 'none' }}>
      {LINKS.map((l) => (
        <g key={l.id} strokeLinecap="round">
          <line x1={TITLE.x} y1={TITLE.y} x2={l.p.x} y2={l.p.y} stroke={INK} strokeWidth={34} />
          <line x1={TITLE.x} y1={TITLE.y} x2={l.p.x} y2={l.p.y} stroke={l.color} strokeWidth={20} strokeDasharray="70 40" />
        </g>
      ))}
    </svg>
  )
}

/* square handle where each thread meets its panel border (straddles the edge, barely touches content) */
function Nodes() {
  return (
    <svg className="absolute inset-0" width={W} height={H} style={{ pointerEvents: 'none', zIndex: 30 }}>
      {LINKS.map((l) => (
        <rect key={l.id} x={l.p.x - 52} y={l.p.y - 52} width={104} height={104} fill="#fff" stroke={l.color} strokeWidth={26} />
      ))}
    </svg>
  )
}

/* ---------- Poster ---------- */
function Poster() {
  return (
    <div className="relative overflow-hidden" style={{ width: W, height: H, background: CANVAS }}>
      {/* annotation canvas: fine grid with stronger lines every 5 cells */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(20,20,20,0.12) 3px, transparent 3px), linear-gradient(90deg, rgba(20,20,20,0.12) 3px, transparent 3px), linear-gradient(rgba(20,20,20,0.06) 3px, transparent 3px), linear-gradient(90deg, rgba(20,20,20,0.06) 3px, transparent 3px)',
          backgroundSize: '1000px 1000px, 1000px 1000px, 200px 200px, 200px 200px',
        }}
      />

      <Links />

      {/* top band, left: context + task */}
      <Panel id="A" />
      <Panel id="B" />
      <Panel id="C">
        <SplitsTree />
      </Panel>
      <Panel id="D" />

      {/* top band, right: link / QR, attribute legend, key numbers */}
      <Panel id="QR">
        <LinkColumn
          side="left"
          kicker="Dataset"
          title="Labels, boxes, attributes"
          qr="qr-hf.svg"
          logo="logo-hf.png"
          link="huggingface.co/datasets/vrg-prague/ReImageNet"
        />
        <div className="absolute inset-y-0 left-1/2" style={{ borderLeft: '10px dashed rgba(20,20,20,0.3)', top: 150, bottom: 150 }} />
        <LinkColumn
          side="right"
          kicker="Tool"
          title="Annotation Preview and Review"
          qr="qr-vrg.svg"
          logo="logo-vrg.png"
          link="klarajanouskova.github.io/ImageNet"
        />
      </Panel>
      <Panel id="A2">
        <div className="absolute flex flex-col" style={{ left: 110, right: 110, top: 260, bottom: 80, gap: 44 }}>
          <div className="flex" style={{ gap: 60 }}>
            <AttrCell name="rendition" color={ATTR.rendition} src="attr-rendition-piano.jpg" text="Toy, drawing or other stylized depiction" />
            <AttrCell name="crowd" color={ATTR.crowd} src="attr-crowd-flamingo.jpg" pos="center bottom" text="5+ instances of one class, collapsed into a single box" />
          </div>
          <div className="flex" style={{ gap: 60 }}>
            <AttrCell name="text-recognition" color={ATTR.text} src="attr-text-theater.jpg" text="Class is only recognizable by reading the text" />
            <AttrCell name="reflection" color={ATTR.reflection} src="attr-reflection-mau.jpg" text="Object seen in a mirror or water surface" />
          </div>
          <div className="flex flex-col" style={{ gap: 18 }}>
            <div className="flex items-start" style={{ gap: 60 }}>
              <div className="flex flex-1 justify-center">
                <ExampleImg src="attr-dominant-terriers.jpg" height={720} tag="both dominant" />
              </div>
              <div className="flex flex-1 justify-center">
                <ExampleImg src="attr-notdominant-cap.jpg" height={720} tag="not dominant" />
              </div>
            </div>
            <AttrNote name="dominant" color={ATTR.dominant} text="Noticed immediately: a judgment, not a matter of size" />
          </div>
        </div>
      </Panel>
      <Panel id="B2">
        <div className="absolute flex flex-col" style={{ left: 120, right: 120, top: 270, bottom: 90 }}>
          {(
            [
              ['≈12%', ['of the original ImageNet-1k', 'labels are incorrect']],
              ['31.9%', ['of images are multilabel']],
              ['4.0%', ['of images contain no object', 'from an ImageNet-1k class']],
            ] as [string, string[]][]
          ).map(([num, lines], i) => (
            <div key={num} className="flex flex-1 items-center" style={{ gap: 70, borderTop: i ? '10px dashed rgba(20,20,20,0.25)' : undefined }}>
              <div className="shrink-0" style={{ width: 1050 }}>
                <FitLine target={1050} max={330} className="font-display italic text-ink" style={{ lineHeight: 1, letterSpacing: '0.01em' }}>
                  {num}
                </FitLine>
              </div>
              {/* two explicit lines; size follows the column width so the longest line always fits */}
              <div className="min-w-0 flex-1" style={{ containerType: 'inline-size' }}>
                <div className="font-body font-semibold text-ink" style={{ fontSize: 'min(150px, 6.3cqw)', lineHeight: 1.12, whiteSpace: 'nowrap' }}>
                  {lines.map((l) => (
                    <div key={l}>{l}</div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* scattered pile: method + results, in reading order */}
      <Panel id="M1" />
      <Panel id="M2" />
      <Panel id="M3" />
      <Panel id="M4" />
      <Panel id="M5" />
      <Panel id="M6" />
      <Panel id="M7" />
      <Panel id="M8" />
      <Panel id="M9" />
      <Panel id="M10" />

      <TitleBlock />
      <Nodes />

      {/* thin board edge */}
      <div className="absolute inset-0" style={{ zIndex: 60, pointerEvents: 'none', boxSizing: 'border-box', border: `40px solid ${INK}` }} />
    </div>
  )
}

/* ---------- Fit-to-screen viewer (poster itself stays 19876 x 12600) ---------- */
function PosterV2() {
  const [scale, setScale] = useState(0.1)

  useEffect(() => {
    document.title = 'Doomed to Re-Annotate, Forever!'
    const fit = () => {
      const m = 32
      setScale(Math.min((window.innerWidth - m * 2) / W, (window.innerHeight - m * 2) / H))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center" style={{ padding: 32 }}>
      <div style={{ width: W * scale, height: H * scale, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div id="poster" style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <Poster />
        </div>
      </div>
    </div>
  )
}

/* Open with  ?v=1  to see the saved v1 (cork board + comic panels). */
export default function App() {
  const v = new URLSearchParams(window.location.search).get('v')
  return v === '1' ? <PosterV1CorkboardComic /> : <PosterV2 />
}
