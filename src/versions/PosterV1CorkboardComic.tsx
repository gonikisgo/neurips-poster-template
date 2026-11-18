import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'

/* ---------- Poster geometry (CSS px, exact target size) ---------- */
const W = 19876
const H = 12600
const BORDER = 36
/* Title burst lives in the top band so name + link are readable over people's heads */
const TITLE = { x: W / 2, y: 2600 }

/* Panel rectangles [x, y, w, h] – deliberately mixed sizes / aspect ratios.
   Top band: panels | title burst | link (QR). Below: a loose, overlapping pile of bigger panels. */
const R = {
  // top band, left of the title
  A: [320, 320, 3500, 2400],
  B: [4080, 320, 2200, 3000],
  C: [320, 2980, 2800, 1920],
  D: [3380, 3580, 2900, 1320],
  // top band, right of the title: link / QR + two more
  QR: [13600, 320, 5956, 2300],
  A2: [13600, 2880, 2200, 2020],
  B2: [16060, 2880, 3496, 2020],
  // scattered pile below the title: bigger, overlapping, rotated (later entries lie on top)
  M1: [380, 5250, 4400, 3500],
  M2: [4900, 5200, 3500, 2600],
  M3: [8500, 5400, 3900, 3700],
  M4: [12500, 5200, 3500, 2700],
  M5: [16100, 5300, 3400, 3800],
  M6: [380, 9000, 3500, 3250],
  M7: [4000, 8600, 3600, 3650],
  M8: [7750, 9500, 4300, 2750],
  M9: [12200, 8300, 3500, 3950],
  M10: [15850, 9500, 3400, 2750],
} as const satisfies Record<string, readonly [number, number, number, number]>
type PanelId = keyof typeof R

/* Extra rotation (deg) for the scattered pile – the rest use the small default tilt */
const ROT: Partial<Record<PanelId, number>> = {
  M1: -2.5, M2: 3, M3: -2, M4: 3.5, M5: -2.5,
  M6: 2, M7: -3, M8: 2, M9: -2.5, M10: 3,
}

/* ---------- Primitives ---------- */
function Badge({ n }: { n: number }) {
  return (
    <div
      className="absolute z-20 flex items-center justify-center rounded-full bg-ink font-display text-paper"
      style={{ top: 50, right: 50, width: 190, height: 190, fontSize: 124, paddingTop: 6 }}
    >
      {n}
    </div>
  )
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <div
      className="absolute z-10 whitespace-nowrap bg-comic-yellow font-display italic text-ink"
      style={{
        top: -BORDER,
        left: -BORDER,
        border: `${BORDER}px solid #141414`,
        padding: '28px 90px 20px 60px',
        fontSize: 150,
        lineHeight: 1,
        letterSpacing: 3,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  )
}

function Caption({ children, light }: { children: ReactNode; light?: boolean }) {
  return (
    <div
      className="absolute font-mono uppercase"
      style={{ left: 90, bottom: 70, fontSize: 78, letterSpacing: 5, color: light ? '#e9e5da' : 'rgba(20,20,20,0.8)' }}
    >
      [{children}]
    </div>
  )
}

/* Speech bubble. Position with style props (top/left/right/bottom). */
function Bubble({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      className="absolute whitespace-nowrap bg-white font-body text-ink"
      style={{
        border: '24px solid #141414',
        borderRadius: 170,
        padding: '60px 130px',
        fontSize: 170,
        lineHeight: 1.1,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/* Red italic SFX / callout */
function Callout({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      className="absolute font-display italic text-comic-red"
      style={{ fontSize: 250, lineHeight: 0.95, transform: 'skewX(-8deg) rotate(-4deg)', ...style }}
    >
      {children}
    </div>
  )
}

/* Red rubber stamp */
function Stamp({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      className="absolute whitespace-nowrap font-display italic text-comic-red"
      style={{
        border: '26px solid #c93a2b',
        padding: '20px 100px 6px',
        fontSize: 290,
        lineHeight: 1,
        transform: 'rotate(-6deg)',
        opacity: 0.92,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/* Sticky note; sits on top of panels */
const STICKY_COLORS = { yellow: '#f4e36a', green: '#b9e08a', blue: '#a9d6ec', pink: '#f4b6c6' }
function Sticky({
  children,
  color = 'yellow',
  rotate = -4,
  style,
}: {
  children: ReactNode
  color?: keyof typeof STICKY_COLORS
  rotate?: number
  style?: CSSProperties
}) {
  return (
    <div
      className="absolute whitespace-nowrap font-body font-bold text-ink"
      style={{
        zIndex: 40,
        minWidth: 520,
        padding: '90px 90px 70px',
        fontSize: 170,
        lineHeight: 1.1,
        textAlign: 'center',
        background: `linear-gradient(170deg, ${STICKY_COLORS[color]} 0%, ${STICKY_COLORS[color]} 80%, rgba(0,0,0,0.08) 100%)`,
        boxShadow: '22px 34px 44px rgba(20,12,0,0.38)',
        transform: `rotate(${rotate}deg)`,
        ...style,
      }}
    >
      <div
        className="absolute"
        style={{
          top: -42,
          left: '50%',
          width: 300,
          height: 90,
          marginLeft: -150,
          background: 'rgba(235,228,205,0.7)',
          boxShadow: '0 6px 14px rgba(0,0,0,0.2)',
          transform: 'rotate(-3deg)',
        }}
      />
      {children}
    </div>
  )
}

/* "Paper lifted off the board": small flat tilt per panel (deterministic) */
const tiltFor = (n: number) => ({
  rz: Math.sin(n * 2.1) * 0.9,
  skx: Math.sin(n * 1.3) * 0.55,
  sky: Math.cos(n * 1.7) * 0.3,
})

type Variant = 'gray' | 'yellow' | 'white' | 'dark'
const VARIANT_BG: Record<Variant, string> = { gray: '#d9d5c9', yellow: '#f4d85a', white: '#ffffff', dark: '#2a2927' }

function Panel({
  id,
  n,
  tag,
  caption,
  variant = 'gray',
  children,
}: {
  id: PanelId
  n: number
  tag?: string
  caption?: string
  variant?: Variant
  children?: ReactNode
}) {
  const [x, y, w, h] = R[id]
  const t = tiltFor(n)
  const rz = ROT[id] ?? t.rz
  return (
    <section
      className="absolute"
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        background: VARIANT_BG[variant],
        border: `${BORDER}px solid #141414`,
        boxSizing: 'border-box',
        boxShadow: `${22 + t.skx * 20}px ${48 + t.sky * 20}px 70px rgba(20,12,0,0.5), 8px 12px 16px rgba(20,12,0,0.35)`,
        transform: `rotate(${rz}deg) skew(${t.skx}deg, ${t.sky}deg)`,
      }}
      data-panel={n}
    >
      {tag && <Tag>{tag}</Tag>}
      <Badge n={n} />
      {children}
      {caption && <Caption light={variant === 'dark'}>{caption}</Caption>}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          zIndex: 15,
          background:
            'linear-gradient(118deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 38%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.07) 100%)',
        }}
      />
    </section>
  )
}

/* ---------- Title card: the poster title as an annotated object (bounding box, handles, label, attributes) ---------- */
const BURST_W = 6700
const BURST_H = 4600
const RED = '#c93a2b'

function Handle({ style }: { style: CSSProperties }) {
  return (
    <div
      className="absolute"
      style={{ width: 140, height: 140, marginLeft: -70, marginTop: -70, background: '#fff', border: `36px solid ${RED}`, boxSizing: 'border-box', ...style }}
    />
  )
}

function AttrChip({ label, checked = true }: { label: string; checked?: boolean }) {
  return (
    <div
      className="flex items-center whitespace-nowrap bg-white font-mono font-semibold text-ink"
      style={{ border: '20px solid #141414', padding: '18px 60px 18px 40px', fontSize: 96, gap: 40 }}
    >
      <span
        className="inline-flex items-center justify-center"
        style={{ width: 90, height: 90, border: '16px solid #141414', background: checked ? RED : '#fff', color: '#fff', fontSize: 80, lineHeight: 1 }}
      >
        {checked ? '✓' : ''}
      </span>
      {label}
    </div>
  )
}

function TitleBlock() {
  const BOX = { l: 60, r: 60, t: 190, b: 230 }
  const boxW = BURST_W - BOX.l - BOX.r
  const boxH = BURST_H - BOX.t - BOX.b
  const hx = [0, boxW / 2, boxW]
  const hy = [0, boxH / 2, boxH]
  return (
    <section
      className="absolute"
      style={{
        left: TITLE.x - BURST_W / 2,
        top: TITLE.y - BURST_H / 2,
        width: BURST_W,
        height: BURST_H,
        zIndex: 28,
        transform: 'rotate(-1.2deg)',
        filter: 'drop-shadow(30px 44px 36px rgba(20,12,0,0.5))',
      }}
    >
      {/* the paper card */}
      <div
        className="absolute"
        style={{ left: BOX.l + 50, right: BOX.r + 50, top: BOX.t + 50, bottom: BOX.b + 50, background: '#f4efe6', border: '36px solid #141414' }}
      />
      {/* bounding box + handles */}
      <div className="absolute" style={{ left: BOX.l, top: BOX.t, width: boxW, height: boxH, border: `40px solid ${RED}`, boxSizing: 'border-box' }}>
        {hx.flatMap((x, i) => hy.map((y, j) => (i === 1 && j === 1 ? null : <Handle key={`${i}${j}`} style={{ left: x, top: y }} />)))}
      </div>
      {/* label chip */}
      <div
        className="absolute whitespace-nowrap font-mono font-semibold text-white"
        style={{ left: BOX.l - 12, top: 20, background: RED, padding: '30px 90px 24px 70px', fontSize: 110, letterSpacing: 4 }}
      >
        ReGT: title · poster
      </div>
      {/* attribute checkboxes */}
      <div className="absolute flex" style={{ left: BOX.l, bottom: 20, gap: 60 }}>
        <AttrChip label="dominant" />
        <AttrChip label="text-recognition" />
        <AttrChip label="rendition" checked={false} />
      </div>

      {/* content */}
      <div
        className="absolute flex flex-col items-center justify-center text-center"
        style={{ left: BOX.l + 86, right: BOX.r + 86, top: BOX.t + 86, bottom: BOX.b + 86 }}
      >
        <div className="font-mono font-semibold uppercase text-ink" style={{ fontSize: 92, letterSpacing: 26, whiteSpace: 'nowrap' }}>
          NeurIPS 2026 · Spotlight
        </div>
        <h1
          className="m-0 font-display text-ink"
          style={{ fontSize: 700, lineHeight: 0.92, transform: 'skewX(-8deg)', marginTop: 40, letterSpacing: 6, whiteSpace: 'nowrap' }}
        >
          DOOMED TO
          <br />
          RE-ANNOTATE,
        </h1>
        <div
          className="font-display text-comic-red"
          style={{ fontSize: 860, lineHeight: 0.95, transform: 'skewX(-8deg) rotate(-2deg)', letterSpacing: 6 }}
        >
          FOREVER!
        </div>
        <div
          className="whitespace-nowrap bg-ink font-display italic text-comic-yellow"
          style={{ fontSize: 400, lineHeight: 1, padding: '30px 140px 10px', marginTop: 50, transform: 'skewX(-6deg) rotate(-1deg)', letterSpacing: 6 }}
        >
          The ImageNet Story
        </div>
        <div className="font-mono font-semibold text-ink" style={{ fontSize: 138, marginTop: 70, lineHeight: 1.35, letterSpacing: 2, whiteSpace: 'nowrap' }}>
          Volkov · Kisel · Mishkina · Janoušková · Matas
          <br />
          <span className="font-normal text-ink/80" style={{ fontSize: 112 }}>
            Visual Recognition Group, CTU in Prague
          </span>
        </div>
      </div>
    </section>
  )
}

/* ---------- Yarn: a few taut threads pinned between panels (edit STRINGS to taste) ---------- */
type Pt = { x: number; y: number }

// pin spec: 'A@br' = panel A, bottom-right corner (tl | tr | bl | br). Top-right pins sit left of the number badge.
function pinFor(spec: string): Pt {
  const [id, corner] = spec.split('@') as [PanelId, string]
  const [x, y, w, h] = R[id]
  const inset = 110
  const px = corner.endsWith('r') ? x + w - (corner === 'tr' ? 430 : inset) : x + inset
  const py = corner.startsWith('b') ? y + h - inset : y + inset
  // follow the panel's own rotation so the pin stays on the paper
  const th = ((ROT[id] ?? 0) * Math.PI) / 180
  const cx = x + w / 2
  const cy = y + h / 2
  const dx = px - cx
  const dy = py - cy
  return { x: cx + dx * Math.cos(th) - dy * Math.sin(th), y: cy + dx * Math.sin(th) + dy * Math.cos(th) }
}

// the one master pin on the tip of the title burst – every thread ends here
const MASTER: Pt = { x: TITLE.x, y: TITLE.y - BURST_H / 2 + 150 }

// panels that are strung to the master pin (edit freely)
const PINNED_PANELS = ['A@br', 'B@tr', 'C@br', 'QR@bl', 'A2@tr', 'M1@tr', 'M2@tr', 'M3@tl', 'M4@tr', 'M5@tl', 'M7@tr', 'M8@tl', 'M9@tr', 'M10@tl']
const STRINGS: [Pt, Pt][] = PINNED_PANELS.map((k) => [pinFor(k), MASTER])

function threadPath(a: Pt, b: Pt) {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2 + len * 0.02 // slight sag
  return `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`
}

function Yarn() {
  return (
    <svg className="absolute inset-0" width={W} height={H} style={{ pointerEvents: 'none', zIndex: 25 }}>
      {STRINGS.map(([ka, kb], i) => {
        const d = threadPath(ka, kb)
        return (
          <g key={i} strokeLinecap="round" fill="none">
            {/* cast shadow on the paper / cork */}
            <path d={d} stroke="#000" strokeWidth={14} opacity={0.28} transform="translate(12 20)" />
            {/* body of the thread */}
            <path d={d} stroke="#6e1a12" strokeWidth={17} />
            {/* twisted plies */}
            <path d={d} stroke="#b8302369" strokeWidth={12} strokeDasharray="22 10" />
            <path d={d} stroke="#e0665a" strokeWidth={6} strokeDasharray="9 26" />
            <path d={d} stroke="#ffb0a3" strokeWidth={2.5} strokeDasharray="4 33" strokeDashoffset={14} opacity={0.8} />
          </g>
        )
      })}
    </svg>
  )
}

/* Push-pin heads with the thread wrapped around them */
function PinHead({ p, scale = 1 }: { p: Pt; scale?: number }) {
  return (
    <g>
      <ellipse cx={p.x + 16 * scale} cy={p.y + 26 * scale} rx={62 * scale} ry={54 * scale} fill="#000" opacity={0.32} />
      <circle cx={p.x} cy={p.y} r={46 * scale} fill="none" stroke="#6e1a12" strokeWidth={14} />
      <circle cx={p.x} cy={p.y} r={46 * scale} fill="none" stroke="#c93a2b" strokeWidth={7} strokeDasharray="12 9" />
      <circle cx={p.x} cy={p.y} r={56 * scale} fill="#b3281c" stroke="#141414" strokeWidth={14} />
      <circle cx={p.x - 18 * scale} cy={p.y - 18 * scale} r={16 * scale} fill="#fbd0c8" />
    </g>
  )
}

function Pins() {
  return (
    <svg className="absolute inset-0" width={W} height={H} style={{ pointerEvents: 'none', zIndex: 30 }}>
      {PINNED_PANELS.map((k) => (
        <PinHead key={k} p={pinFor(k)} />
      ))}
      <PinHead p={MASTER} scale={1.7} />
    </svg>
  )
}

/* ---------- Poster ---------- */
const CORK = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='700' height='700'><filter id='a' x='0' y='0' width='100%25' height='100%25'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' seed='4' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.35  0 0 0 0 0.2  0 0 0 0 0.08  0 0 0 1.4 -0.35'/></filter><filter id='b' x='0' y='0' width='100%25' height='100%25'><feTurbulence type='fractalNoise' baseFrequency='0.012 0.02' numOctaves='3' seed='9' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.25  0 0 0 0 0.14  0 0 0 0 0.05  0 0 0 0.9 -0.2'/></filter><rect width='700' height='700' fill='%23b88553'/><rect width='700' height='700' filter='url(%23b)'/><rect width='700' height='700' filter='url(%23a)'/></svg>"
const FRAME = 150

const at = (id: PanelId, dx: number, dy: number): CSSProperties => ({ left: R[id][0] + dx, top: R[id][1] + dy })

function Poster() {
  return (
    <div className="relative overflow-hidden" style={{ width: W, height: H, background: '#b88553' }}>
      <div className="absolute inset-0" style={{ backgroundImage: `url("${CORK}")`, backgroundSize: '700px 700px' }} />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 45%, rgba(255,235,190,0.28), rgba(40,20,0,0.38) 100%)' }}
      />

      {/* top band, left */}
      <Panel id="A" n={1} tag="ImageNet, 2012" caption="Image">
        <Bubble style={{ top: 420, right: 200 }}>Speech bubble.</Bubble>
      </Panel>
      <Panel id="B" n={2} tag="Years later..." caption="Zoomed">
        <Bubble style={{ top: 520, left: 160 }}>Bubble.</Bubble>
      </Panel>
      <Panel id="C" n={3} tag="Fixed. For good." caption="Annotator at desk">
        <Callout style={{ left: 140, bottom: 200 }}>↑ Back to 1</Callout>
      </Panel>
      <Panel id="D" n={4} caption="Image">
        <Bubble style={{ top: 300, left: 200 }}>Speech bubble.</Bubble>
      </Panel>

      {/* top band, right: link / QR */}
      <Panel id="QR" n={5} variant="white">
        <div
          className="absolute flex items-center justify-center bg-ink font-mono text-paper"
          style={{ left: 300, top: '50%', width: 1500, height: 1500, marginTop: -750, fontSize: 100 }}
        >
          [QR]
        </div>
        <div className="absolute font-body" style={{ left: 2150, top: '50%', transform: 'translateY(-50%)', fontSize: 190, lineHeight: 1.25 }}>
          Link headline:
          <div className="font-mono" style={{ fontSize: 120, marginTop: 60, lineHeight: 1.5 }}>
            huggingface.co/datasets/
            <br />
            vrg-prague/ReImageNet
          </div>
        </div>
      </Panel>
      <Panel id="A2" n={6} variant="dark" caption="Image" />
      <Panel id="B2" n={7} variant="yellow">
        <div className="absolute font-display italic" style={{ left: 150, top: 330, fontSize: 700, lineHeight: 1, letterSpacing: 3 }}>
          00.0%
        </div>
        <div className="absolute font-body" style={{ left: 170, top: 1330, fontSize: 150, lineHeight: 1.3, maxWidth: '62%' }}>
          Key statistic description goes here.
        </div>
      </Panel>

      {/* scattered pile */}
      <Panel id="M1" n={8} caption="Image">
        <Bubble style={{ top: 520, left: 220 }}>Speech bubble.</Bubble>
      </Panel>
      <Panel id="M2" n={9} variant="dark" caption="Image" />
      <Panel id="M3" n={10} caption="Three annotators">
        <Bubble style={{ top: 320, left: 220 }}>Bubble!</Bubble>
        <Bubble style={{ top: 1250, left: 1900 }}>Both??</Bubble>
      </Panel>
      <Panel id="M4" n={11} caption="Image">
        <Callout style={{ left: 200, top: 700 }}>+ callout</Callout>
      </Panel>
      <Panel id="M5" n={12} caption="Image">
        <Bubble style={{ top: 560, left: 200 }}>Speech bubble.</Bubble>
      </Panel>
      <Panel id="M6" n={13} caption="Image">
        <Stamp style={{ right: 160, bottom: 140 }}>∅ 0.0%</Stamp>
      </Panel>
      <Panel id="M7" n={14} variant="dark" caption="Image" />
      <Panel id="M8" n={15} caption="Image">
        <Bubble style={{ top: 330, right: 220 }}>Bubble?</Bubble>
      </Panel>
      <Panel id="M9" n={16} caption="Image">
        <Bubble style={{ top: 560, left: 180 }}>Speech bubble.</Bubble>
      </Panel>
      <Panel id="M10" n={17} caption="Image">
        <Stamp style={{ right: 140, bottom: 120 }}>∅ 0.0%</Stamp>
      </Panel>

      <TitleBlock />
      <Yarn />
      <Pins />

      {/* stickers on top of panels */}
      <Sticky style={at('A', 2300, -150)}>#1</Sticky>
      <Sticky color="green" rotate={5} style={at('B', 700, 2380)}>
        what?
      </Sticky>
      <Sticky color="blue" rotate={-6} style={at('QR', 4900, 1800)}>
        24 may
      </Sticky>
      <Sticky color="pink" rotate={4} style={at('D', 2000, 780)}>
        ?
      </Sticky>
      <Sticky rotate={-3} style={at('B2', 2450, 1380)}>
        #7
      </Sticky>
      <Sticky color="pink" rotate={6} style={at('M10', 1200, 1300)}>
        why five?
      </Sticky>
      <Sticky color="green" rotate={-5} style={at('M6', 1300, 1300)}>
        look!
      </Sticky>
      <Sticky color="blue" rotate={3} style={at('M7', 900, 2700)}>
        #16
      </Sticky>

      {/* brushed aluminium board frame */}
      <div
        className="absolute inset-0"
        style={{
          zIndex: 60,
          pointerEvents: 'none',
          boxSizing: 'border-box',
          border: `${FRAME}px solid transparent`,
          borderImage: 'linear-gradient(135deg, #f2f3f4 0%, #aeb2b6 22%, #e9eaec 45%, #8f9498 70%, #dfe1e3 100%) 1',
          boxShadow: 'inset 0 0 0 10px rgba(0,0,0,0.35), inset 40px 50px 90px rgba(0,0,0,0.45)',
        }}
      />
      <div
        className="absolute"
        style={{ zIndex: 61, pointerEvents: 'none', inset: FRAME, boxShadow: 'inset 0 0 120px rgba(0,0,0,0.5)' }}
      />
    </div>
  )
}

/* ---------- Fit-to-screen viewer (poster itself stays 19876 x 12600) ---------- */
export default function PosterV1CorkboardComic() {
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
