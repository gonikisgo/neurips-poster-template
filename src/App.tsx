import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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
const CANVAS = CANVAS_PARAM ? `#${CANVAS_PARAM}` : BG_MODE === 'classic' ? '#f9f5ea' : BG_MODE === 'white' ? '#f6f4ee' : '#e8d9a8'
const BORDER = BG_MODE === 'gray' ? 34 : 18
const TITLE_SCALE = 1.08 // whole title card (box + text) scaled up around its centre
const TITLE = { x: W / 2, y: 30 + (5000 * TITLE_SCALE) / 2 } // centre: the scaled card box starts at y=30

/* Panel rectangles [x, y, w, h]. Top band: context story | task + attributes | title | link + numbers. Below: a loose, overlapping pile. */
const R = {
  // top band: left stack (revised classes, examples), title in the middle, right: splits, distribution, link
  C: [14000, 2730, 5556, 2650],
  QR: [14000, 320, 5556, 2000],
  B: [14830, 8230, 2200, 1816], // card 4, left of card 11 (between cards 9 and 11)
  M2: [320, 320, 5560, 2100],
  M6: [320, 2730, 5600, 2300], // revised classes + prior reannotations, fills the gap between M2 and A2
  // bottom band, under the title, full width, story left to right: 9 attributes -> 10 accuracy -> 12 tasks -> 13 derived -> 15 iterative -> 16 recommendations.
  // (sizes = base size x SCALE; card 6 sits under card 9, which may overlap it for now)
  A2: [240, 5300, 5700, 4100],
  M1: [320, 9600, 5700, 2800],
  M3: [6153, 7240, 4200, 5160],
  M5: [6153, 5700, 4200, 1300],
  M8: [10463, 5600, 4200, 3120],
  M7: [10463, 9000, 4300, 3300],
  M9: [14990, 5700, 4700, 2220],
  M10: [14960, 10430, 4600, 1300],
  M11: [17140, 8230, 2550, 1816], // card 12, MLLM vs. trained annotators (split off card 11)
} as const satisfies Record<string, readonly [number, number, number, number]>
type PanelId = keyof typeof R

/* Extra rotation (deg) for the scattered pile */
const ROT: Partial<Record<PanelId, number>> = {
  M1: -1.2,
  A2: 1.5,
  M3: -1.2,
  M5: -1.2,
  M8: 1.2,
  M7: -1.5,
  M9: -1.2,
  M10: 1.5,
}

/* content scale per card: the card's R size is its base size x this (cards without an entry are drawn at 1) */
const SCALE: Partial<Record<PanelId, number>> = {}

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
/* n = reading-order chip (omitted -> no chip); seed = keeps a card's tilt fixed when its number changes.
   Reading order: 1 What reannotation fixes, 2 Class problems, 3 Image splits, then the bottom story
   4 Attributes, 5 Annotation pipeline, 6 One benchmark, 7 Accuracy on ReGT, 8 Object crops, 9 Derived benchmarks,
   10 Labels & boxes, 11 Annotation is iterative, 12 MLLM vs. annotators, 13 Recommendations */
const META: Record<
  PanelId,
  {
    n?: number | string
    seed?: number
    title: string
    group: Group
    hint?: string
    wrap?: boolean // card tag may wrap to two rows (grows upward, stays within the card's width)
    variant?: Variant
    contrib?: string
  }
> = {
  B: {
    n: 10,
    seed: 5,
    title: 'Labels & boxes',
    group: 'results',
    hint: 'Fig. 5: distribution of labels & bounding boxes per image, log-scaled',
  },
  C: { n: 3, title: 'Image splits', group: 'method', variant: 'flat' },
  QR: { n: 'LINK', title: 'Dataset, tool & community', group: 'link', variant: 'white' },
  A2: { n: 4, seed: 9, title: 'Attributes', group: 'method', variant: 'dark' },
  M1: {
    n: 5,
    seed: 7,
    title: 'Annotation pipeline',
    group: 'method',
    hint: 'Train annotators → class groups → per-image labels → verification',
  },
  M2: { n: 1, seed: 4, title: 'What reannotation fixes', group: 'results', variant: 'dark' },
  M3: { n: 7, seed: 10, title: 'Accuracy on ReGT', group: 'results', variant: 'white' },
  M5: { n: 6, seed: 12, title: 'One benchmark, many tasks', group: 'results' },
  M8: { n: 8, seed: 13, title: 'Recognition on object crops', group: 'results' },
  M6: { n: 2, seed: 7, title: 'Class problems & multi-label images', group: 'method' },
  M7: {
    n: 9,
    seed: 14,
    title: 'Errors in derived benchmarks',
    group: 'results',
    variant: 'white',
  },
  M9: {
    n: 11,
    seed: 15,
    title: 'Annotation is iterative',
    group: 'method',
    variant: 'dark',
  },
  M11: { n: 12, seed: 17, title: 'MLLM vs. annotators', group: 'method', variant: 'gray' },
  M10: { n: 13, seed: 16, title: 'Recommendations', group: 'takeaway', variant: 'white' },
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
      style={{
        top: 50,
        right: 50,
        padding: '26px 56px',
        fontSize: 100,
        letterSpacing: 4,
        borderRadius: 24,
      }}
    >
      {typeof n === 'number' ? `#${String(n).padStart(2, '0')}` : n}
    </div>
  )
}

/* Role + section name, on the top-left edge like a bbox label */
function Label({ group, children, wrapW }: { group: Group; children: ReactNode; wrapW?: number }) {
  return (
    <div
      className={`absolute z-10 font-mono font-semibold text-white ${wrapW ? '' : 'whitespace-nowrap'}`}
      style={{
        left: -BORDER,
        // wrapping tag: anchored by its bottom edge (same place as the one-row tag's), so a second row grows upward
        ...(wrapW ? { bottom: `calc(100% + ${BORDER}px)`, width: wrapW + 2 * BORDER } : { top: -190 - BORDER }),
        background: GROUP[group].color,
        padding: '32px 97px 26px 76px',
        fontSize: 119, // = the title card's box tag (110px) as drawn at TITLE_SCALE
        letterSpacing: 4,
        lineHeight: 1.1,
      }}
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
      style={{
        width: hs,
        height: hs,
        background: '#fff',
        border: `16px solid ${color}`,
        boxSizing: 'border-box',
        [x === 'l' ? 'left' : 'right']: off,
        [y === 't' ? 'top' : 'bottom']: off,
      }}
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

const TINT: Record<Group, string> = {
  context: '#cfe0fb',
  method: '#c6ecdb',
  results: '#fcdcb8',
  takeaway: '#e2d3f6',
  link: '#ffffff',
}
// cards are flat: the old 45deg stripes (a/b) hurt text legibility, so only the first colour is used
const hatch = (a: string, _b: string) => a

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
        style={{
          background: color,
          WebkitMaskImage: mask,
          maskImage: mask,
          WebkitMaskSize: '100% 100%',
          maskSize: '100% 100%',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
        }}
      />
      <img src={asset(logo)} alt="" className="absolute" style={{ left: '38.4%', top: '38.4%', width: '23.2%', height: '23.2%' }} />
    </div>
  )
}

/* Link panel: one QR to a single landing page, plus what is waiting there (the page itself is still being built) */
const LINK_ITEMS: { name: string; text?: string; logo?: string; note?: ReactNode }[] = [
  {
    name: 'Annotation forum',
    text: 'discuss & add your annotations',
    note: <>No dataset is ever perfect, so ours is not static:<br />community feedback keeps it growing.</>,
  },
  { name: 'Project page' },
  { name: 'Dataset', logo: 'logo-hf.png' },
  { name: 'Try it yourself', text: 'annotate a few images' },
]

function LinkCard() {
  return (
    <div className="absolute inset-0 flex items-start" style={{ padding: '170px 160px 60px', gap: 130 }}>
      <QrCode qr="qr-vrg.svg" logo="logo-vrg.png" size={1600} />
      <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 44, height: 1600 }}>
        <div className="font-body font-bold text-ink" style={{ fontSize: 240, lineHeight: 0.9, marginBottom: 70 }}>
          Scan to join in
        </div>
        <div className="flex flex-col" style={{ gap: 28 }}>
          {LINK_ITEMS.map(({ name, text, logo, note }) => (
            <div key={name}>
              <div className="flex items-center font-body font-semibold text-ink" style={{ fontSize: 120, lineHeight: 1.15 }}>
                <span className="font-mono font-bold" style={{ marginRight: 36 }}>
                  –
                </span>
                <span
                  className="inline-flex items-center font-mono font-bold uppercase text-white"
                  style={{
                    background: GROUP.link.color,
                    padding: '8px 36px 4px',
                    marginRight: 40,
                    fontSize: 100,
                    letterSpacing: 4,
                    gap: 30,
                  }}
                >
                  {name}
                  {/* logo lives inside the highlighted block */}
                  {logo && <img src={asset(logo)} alt="" style={{ height: 120, width: 'auto', marginTop: -6 }} />}
                </span>
                {text}
              </div>
              {note && (
                <div className="font-body font-semibold text-ink" style={{ fontSize: 120, lineHeight: 1.15, marginLeft: 136, marginTop: 14 }}>
                  {note}
                </div>
              )}
            </div>
          ))}
        </div>
        <div
          className="font-mono font-semibold text-ink"
          style={{
            fontSize: 120,
            lineHeight: 0.8,
            marginTop: 'auto',
            whiteSpace: 'nowrap',
            letterSpacing: '-0.01em',
          }}
        >
          klarajanouskova.github.io/ImageNet
        </div>
      </div>
    </div>
  )
}

/* The paper's five attributes: colour code + short definitions */
const ATTR = {
  rendition: '#f7763d',
  crowd: '#8746ae',
  text: '#9a9a9a',
  reflection: '#3dbfb8',
  dominant: '#b84041',
} // box colours from the paper's Fig. 2

function AttrChip2({ color, children }: { color: string; children: ReactNode }) {
  return (
    <div
      className="inline-block whitespace-nowrap font-mono font-semibold text-white"
      style={{
        background: color,
        padding: '16px 46px 12px 34px',
        fontSize: 92,
        lineHeight: 1.1,
        letterSpacing: 3,
      }}
    >
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
      <div className="font-body font-semibold text-ink" style={{ fontSize: 120, lineHeight: 1.12 }}>
        {text}
      </div>
    </div>
  )
}

function AttrCell({ name, color, src, text, pos = 'center', stat }: { name: string; color: string; src: string; text: string; pos?: string; stat?: number }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 18 }}>
      <div style={{ aspectRatio: '4 / 3', overflow: 'hidden' }}>
        <img src={asset(src)} alt="" className="block h-full w-full" style={{ objectFit: 'cover', objectPosition: pos }} />
      </div>
      <AttrNote name={name} color={color} text={text} />
      {/* pushed to the cell's bottom, so the tiles of all four cells sit on one row whatever the description's length */}
      {stat !== undefined && (
        <div style={{ marginTop: 'auto', paddingTop: 110 }}>
          <AttrStats g={stat} />
        </div>
      )}
    </div>
  )
}

/* ---------- Annotation pipeline (card M1) ----------
   Whole-pipeline steps, then the per-image loop inside the tool as one row of
   app screenshots (from figures/app_screenshots, reordered to story order). */
const APP_STEPS: [string, string, ReactNode][] = [
  ['1', 'Recruit & train in-house non-expert annotators', ''],
  ['2', 'Review correlated classes in groups', ''],
  ['3', 'Class preparation step', ''],
  ['4', 'Label image by image, with OWLv2 hints', ''],
]
const APP_LOOP: [string, string] = ['Revise mid-run, verify at the end', 'edge cases kept updating names, definitions and attributes; a final pass re-checked every image']
const APP_SHOTS: [string, string][] = [
  ['app-loop-1.png', 'pick from the queue'],
  ['app-loop-2.png', 'label all visible ImageNet-1k objects'],
]
const PIPE = { gutter: 120, indent: 220, row: 242, chipMid: 64, loopW: 4960 } // step row: 104px title + 104px line; chip centre 53px from its top

function PipeStep({ n, t, s, children }: { n: string; t: string; s: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-start" style={{ gap: 46 }}>
      {n === '↻' ? (
        // drawn loop icon: the ↻ glyph falls back to a font that renders it small and low
        <div
          className="flex shrink-0 items-center justify-center bg-white"
          style={{
            width: PIPE.indent - 46,
            height: 2 * PIPE.chipMid + 1,
            border: '10px solid #141414',
          }}
        >
          <svg width={92} height={92} viewBox="0 0 64 64">
            <path d="M 52 32 A 20 20 0 1 1 42 14.7" fill="none" stroke={INK} strokeWidth={8} strokeLinecap="round" />
            <polygon points="51,20 33,22 44,5" fill={INK} />
          </svg>
        </div>
      ) : (
        <div
          className="shrink-0 bg-white text-center font-mono font-bold text-ink"
          style={{
            width: PIPE.indent - 46,
            border: '10px solid #141414',
            padding: '10px 0 8px',
            fontSize: 96,
            lineHeight: 1.15,
          }}
        >
          {n}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="whitespace-nowrap font-body font-semibold text-ink" style={{ fontSize: 104, lineHeight: 1.12 }}>
          {t}
        </div>
        {s && (
          <div className="font-body font-semibold" style={{ fontSize: 104, lineHeight: 1.12, color: 'rgba(20,20,20,0.6)', marginTop: 10 }}>
            {s}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

/* step 4 owns the per-image loop inside the tool: 2 x 2 screenshots, then back to the queue */
function AppLoop() {
  const W0 = PIPE.loopW // narrower than the text column: keeps the screenshots clear of the card's right edge
  const GAP = 200 // room between the two shots for the arrow
  const cw = (W0 - GAP) / 2
  const c2 = cw + GAP + cw / 2
  // grid geometry (px): shot height from its aspect ratio, caption = 22 margin + one CAP px line
  const CAP = 104
  const shotH = (cw * 1112) / 1920
  const gridH = shotH + 22 + CAP * 1.25
  const svgTop = gridH + 20 // the svg below the grid starts here
  const backY = shotH / 2 - svgTop // shot 1 mid-height, in svg coordinates
  const backX = -90 // return lane, left of the screenshots (under the step-4 chip)
  return (
    <div style={{ width: W0 }}>
      <div className="relative grid items-start" style={{ gridTemplateColumns: '1fr 1fr', columnGap: GAP, rowGap: 80 }}>
        {/* shot 1 -> shot 2 */}
        <svg className="absolute" width={GAP} height={90} viewBox={`0 0 ${GAP} 90`} style={{ left: cw, top: shotH / 2 - 45 }}>
          <line x1={34} y1={45} x2={GAP - 62} y2={45} stroke={INK} strokeWidth={18} strokeLinecap="round" />
          <polygon points={`${GAP - 78},8 ${GAP - 22},45 ${GAP - 78},82`} fill={INK} />
        </svg>
        {APP_SHOTS.map(([src, cap]) => (
          <div key={src} className="relative min-w-0">
            <img
              src={asset(src)}
              alt={cap}
              className="block w-full"
              style={{
                border: '12px solid #141414',
                aspectRatio: '1920 / 1112',
                objectFit: 'cover',
              }}
            />
            <div
              className="text-center font-mono font-semibold"
              style={{
                fontSize: CAP,
                lineHeight: 1.25,
                color: 'rgba(20,20,20,0.75)',
                marginTop: 22,
              }}
            >
              {cap}
            </div>
          </div>
        ))}
      </div>
      {/* last image back to the queue (shot 1), x50,000 times: down, left, up the left lane, into shot 1 */}
      <svg width={W0} height={210} style={{ display: 'block', overflow: 'visible', marginTop: 20 }}>
        <path d={`M ${c2} 6 V 64 H ${backX} V ${backY} H -40`} fill="none" stroke={INK} strokeWidth={18} strokeDasharray="38 28" strokeLinecap="round" strokeLinejoin="round" />
        <polygon points={`-2,${backY} -48,${backY - 32} -48,${backY + 32}`} fill={INK} />
        <text x={W0 / 2} y={200} textAnchor="middle" className="font-mono" fill="rgba(20,20,20,0.55)" fontSize={104} letterSpacing={4}>
          × 50,000 images, one loop each
        </text>
      </svg>
    </div>
  )
}

function PipelineCard() {
  return (
    // no bottom anchor: the block is as tall as its content, so the bracket ends exactly at the ↻ row
    <div className="absolute flex" style={{ left: 70, right: 100, top: 140 }}>
      {/* the whole pipeline is revisited: dashed bracket from the ↻ row back up to step 1 */}
      <div className="relative shrink-0" style={{ width: PIPE.gutter }}>
        {/* bracket drawn as three plain bars (one dashed shaft + two solid ends): no CSS dashed border, so the shaft cannot render doubled */}
        <div
          className="absolute"
          style={{
            left: 16,
            width: 18,
            top: PIPE.chipMid - 9,
            bottom: PIPE.row - PIPE.chipMid - 10,
            backgroundImage: `repeating-linear-gradient(to bottom, ${INK} 0 38px, transparent 38px 66px)`,
          }}
        />
        <div className="absolute" style={{ left: 16, width: 64, height: 18, top: PIPE.chipMid - 9, background: INK }} />
        <div className="absolute" style={{ left: 16, width: PIPE.gutter - 16, height: 18, bottom: PIPE.row - PIPE.chipMid - 10, background: INK }} />
        <div
          className="absolute"
          style={{
            left: PIPE.gutter - 42,
            top: PIPE.chipMid - 26,
            width: 0,
            height: 0,
            borderTop: '26px solid transparent',
            borderBottom: '26px solid transparent',
            borderLeft: `42px solid ${INK}`,
          }}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 90 }}>
        {/* steps 1 2 / 3 4 in a 2 x 2 grid, the tool screenshots (step 4's loop) under them */}
        <div className="grid items-start" style={{ gridTemplateColumns: '2750px 1fr', columnGap: 60, rowGap: 60 }}>
          {APP_STEPS.map(([n, t, s]) => (
            <PipeStep key={n} n={n} t={t} s={s} />
          ))}
        </div>
        {/* fixed box = the old (4400 px wide) loop's height, so the rows above and below stay put; the bigger loop grows equally up and down out of it, centred on the card */}
        <div style={{ height: 1645, paddingLeft: 225, marginTop: 70 }}>
          <div style={{ position: 'relative', top: -58 }}>
            <AppLoop />
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <PipeStep n="↻" t={APP_LOOP[0]} s={APP_LOOP[1]} />
        </div>
      </div>
    </div>
  )
}

/* ---------- Image splits (the paper's Fig. 4 as a left-to-right tree) ---------- */
const TREE = { w: 5180, row: 300, gap: 36 }
const N_DROP = 60 // N sits lower than the M row grid: extra air below M
const N_EXTRA = 180 // N is taller than a row: room for the QR code beside it
const TREE_H = 5 * TREE.row + 4 * TREE.gap + N_DROP + N_EXTRA
const rowY = (r: number) => r * (TREE.row + TREE.gap)
const COL = { a: { x: 0, w: 760 }, b: { x: 840, w: 1250 }, c: { x: 2180, w: 3000 } }
// semi-transparent tints (as in the paper): poster green = Method role colour, poster red = RED
const TONE = {
  grey: 'rgba(255,255,255,0.6)',
  green: 'rgba(42,168,118,0.34)',
  red: 'rgba(224,65,47,0.30)',
}

type TreeNode = {
  key: string
  col: 'a' | 'b' | 'c'
  y: number
  h: number
  tone: keyof typeof TONE
  code: string
  pct: string
  desc: string
}
const TREE_NODES: TreeNode[] = [
  {
    key: 'A',
    col: 'a',
    y: TREE_H / 2 - 150,
    h: 300,
    tone: 'grey',
    code: 'A',
    pct: '100%',
    desc: 'all images',
  },
  {
    key: 'S',
    col: 'b',
    y: rowY(0),
    h: 2 * TREE.row + TREE.gap,
    tone: 'grey',
    code: 'S',
    pct: '64.1%',
    desc: 'single ReGT label',
  },
  {
    key: 'N',
    col: 'b',
    y: rowY(4) + N_DROP,
    h: TREE.row + N_EXTRA,
    tone: 'grey',
    code: 'N',
    pct: '4.0%',
    desc: 'no ImageNet-1k object',
  },
  {
    key: 'M',
    col: 'b',
    y: rowY(2),
    h: 2 * TREE.row + TREE.gap,
    tone: 'grey',
    code: 'M',
    pct: '31.9%',
    desc: 'multiple ReGT labels',
  },
  {
    key: 'S+',
    col: 'c',
    y: rowY(0),
    h: TREE.row,
    tone: 'green',
    code: 'S+',
    pct: '58.4%',
    desc: 'ImGT label is the ReGT label',
  },
  {
    key: 'S−',
    col: 'c',
    y: rowY(1),
    h: TREE.row,
    tone: 'red',
    code: 'S−',
    pct: '5.6%',
    desc: 'ImGT label is not the ReGT label',
  },
  {
    key: 'M+',
    col: 'c',
    y: rowY(2),
    h: TREE.row,
    tone: 'green',
    code: 'M+',
    pct: '29.4%',
    desc: 'ImGT label is among the ReGT labels',
  },
  {
    key: 'M−',
    col: 'c',
    y: rowY(3),
    h: TREE.row,
    tone: 'red',
    code: 'M−',
    pct: '2.5%',
    desc: 'ImGT label is not among the ReGT labels',
  },
]
const nodeByKey = (k: string) => TREE_NODES.find((n) => n.key === k)!
const TREE_EDGES: [string, string][] = [
  ['A', 'S'],
  ['A', 'M'],
  ['A', 'N'],
  ['S', 'S+'],
  ['S', 'S−'],
  ['M', 'M+'],
  ['M', 'M−'],
]

/* what the two label sets are: close to the top, so the story can point back to it */
function GtDefs() {
  return (
    <div className="absolute flex flex-col" style={{ left: 100, top: 40, gap: 6 }}>
      {(
        [
          ['ReGT', 'Our ReImageNet annotations'],
          ['ImGT', 'original single-label ground truth'],
        ] as ['ReGT' | 'ImGT', string][]
      ).map(([k, t]) => (
        <div key={k} className="flex items-center" style={{ gap: 26 }}>
          <span className="font-mono font-bold text-ink" style={{ fontSize: 120, letterSpacing: 2, lineHeight: 1.1 }}>
            {k}:
          </span>
          <div className="whitespace-nowrap font-body font-semibold text-ink" style={{ fontSize: 120, lineHeight: 1.08 }}>
            {t}
          </div>
        </div>
      ))}
    </div>
  )
}

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
    <div className="absolute" style={{ left: 100, top: 400, width: TREE.w, height: TREE_H }}>
      <svg className="absolute inset-0" width={TREE.w} height={TREE_H} style={{ overflow: 'visible' }}>
        {TREE_EDGES.map((e) => (
          <path key={e.join()} d={edge(e)} fill="none" stroke={INK} strokeWidth={10} />
        ))}
      </svg>
      {TREE_NODES.map((n) => (
        <div
          key={n.key}
          className="absolute flex flex-col justify-center"
          style={{
            left: COL[n.col].x,
            top: n.y,
            width: COL[n.col].w,
            height: n.h,
            background: TONE[n.tone],
            border: `10px solid ${INK}`,
            padding: '0 34px',
            boxSizing: 'border-box',
          }}
        >
          <div className="flex items-baseline whitespace-nowrap" style={{ gap: 26, lineHeight: 1 }}>
            <span className="font-mono font-bold text-ink" style={{ fontSize: 92 }}>
              {n.code}
            </span>
            <span className="font-body font-bold text-ink" style={{ fontSize: 100 }}>
              {n.pct}
            </span>
          </div>
          <div className="font-body font-semibold text-ink" style={{ fontSize: 120, lineHeight: 1.1, marginTop: 14 }}>
            {n.desc}
          </div>
        </div>
      ))}
      {/* N: a separate effort on these images (OOD), QR to the colleagues' work, on a sticky note */}
      <div
        className="absolute flex items-center justify-center"
        style={{
          left: COL.b.x + COL.b.w - 70, // overlaps N's right edge: the note is stuck onto the block
          top: rowY(4) + N_DROP + 11, // top edge as before (clear of the M- row); the note grows downward into the room above the legend
          width: 2700,
          height: 570,
          gap: 110,
          padding: '0 0 0 70px', // the note's first 70 px lie on top of N: centre in the visible part
          boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #fffefa 0%, #f6f2e8 100%)',
          boxShadow: '14px 22px 34px rgba(20,20,20,0.32), 0 0 0 2px rgba(20,20,20,0.08)',
          transform: 'rotate(1.8deg)',
        }}
      >
        {/* tape */}
        <div className="absolute" style={{ left: -70, top: 40, width: 260, height: 70, background: 'rgba(214,206,186,0.8)', boxShadow: '0 2px 6px rgba(20,20,20,0.18)', transform: 'rotate(-38deg)' }} />
        <img src={asset('qr-n.png')} alt="QR code: OOD study" className="block shrink-0" style={{ width: 500, height: 500 }} />
        <div className="font-body font-semibold text-ink" style={{ fontSize: 120, lineHeight: 1.12 }}>
          Studied separately as OODs
        </div>
      </div>
      {/* legend: what + / - mean */}
      <div className="absolute flex items-center whitespace-nowrap font-body font-semibold text-ink" style={{ left: 0, top: TREE_H + 160, gap: 110, fontSize: 120 }}>
        <span className="flex items-center" style={{ gap: 24 }}>
          <span style={{ width: 100, height: 100, background: TONE.green, border: `10px solid ${INK}` }} />+ ImGT label agrees with ReGT
        </span>
        <span className="flex items-center" style={{ gap: 24 }}>
          <span style={{ width: 100, height: 100, background: TONE.red, border: `10px solid ${INK}` }} />− disagrees
        </span>
      </div>
    </div>
  )
}

/* ---------- Labels & boxes per image (paper Fig. 5) as a comic duotone histogram ----------
   Labels: solid comic-yellow bars. BBoxes: red halftone-hatched bars behind them.
   Bins 1-5 of labels are
   exact Tab. 6 counts; the long tails are read off the paper's log plot. */
const DIST = {
  labels: [480, 32033, 8769, 3656, 1842, 911, 400, 170, 90, 45, 25, 15, 10, 4, 4],
  boxes: [460, 26000, 9700, 5000, 2400, 1450, 1000, 560, 390, 260, 150, 110, 75, 47, 37, 28, 15, 14, 6, 6, 2, 0, 0, 0, 0, 0, 1],
  meanLabels: 1.63,
  meanBoxes: 1.99,
}

function DistBars() {
  // sized for the top-band card (2200 x 1816): rides up-left inside the card — clear of the right border and the bottom edge (legend lives inside the plot)
  const W0 = 2020,
    H0 = 1686
  const PL = 250,
    PT = 200,
    PR = 40,
    PB = 300
  const pw = W0 - PL - PR,
    ph = H0 - PT - PB
  const XMAX = 27
  const X = (v: number) => PL + (v / XMAX) * pw
  const LMAX = Math.log10(33000)
  const Y = (v: number) => PT + ph - (Math.log10(Math.max(v, 1)) / LMAX) * ph
  const bars = (arr: number[], fill: string) => arr.map((v, i) => (i > XMAX || v <= 0 ? null : <rect key={i} x={X(i) + 4} y={Math.min(Math.max(Y(v), PT + 4), PT + ph - 14)} width={pw / XMAX - 8} height={Math.max(PT + ph - Math.max(Y(v), PT + 4), 14)} fill={fill} stroke={INK} strokeWidth={8} />))
  return (
    <div className="absolute" style={{ left: 20, top: 40, width: W0, height: H0 }}>
      <svg width={W0} height={H0} style={{ overflow: 'visible' }}>
        <defs>
          <pattern id="db-hatch" width="34" height="34" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="34" height="34" fill="rgba(224,65,47,0.15)" />
            <rect width="18" height="34" fill="rgba(224,65,47,0.72)" />
          </pattern>
        </defs>

        {/* decade grid */}
        {[1, 2, 3, 4].map((k) => (
          <line key={k} x1={PL} y1={PT + ph - (k / LMAX) * ph} x2={PL + pw} y2={PT + ph - (k / LMAX) * ph} stroke={INK} strokeOpacity={0.16} strokeWidth={5} strokeDasharray="22 20" />
        ))}
        {[4, 8, 12, 16, 20, 24].map((v) => (
          <line key={v} x1={X(v)} y1={PT} x2={X(v)} y2={PT + ph} stroke={INK} strokeOpacity={0.09} strokeWidth={5} strokeDasharray="14 22" />
        ))}

        {/* series: boxes hatched behind, labels solid yellow in front (bins 1-5 exact, tails from the paper's plots) */}
        {bars(DIST.boxes, 'url(#db-hatch)')}
        {bars(DIST.labels, '#f4d85a')}

        {/* axes */}
        <line x1={PL} y1={PT} x2={PL} y2={PT + ph} stroke={INK} strokeWidth={9} />
        <line x1={PL} y1={PT + ph} x2={PL + pw} y2={PT + ph} stroke={INK} strokeWidth={9} />

        {/* y tick labels */}
        {[
          ['1', 0],
          ['10', 1],
          ['100', 2],
          ['1k', 3],
          ['10k', 4],
        ].map(([s, k]) => (
          <text key={s as string} x={PL - 26} y={PT + ph - ((k as number) / LMAX) * ph} textAnchor="end" dominantBaseline="central" className="font-mono font-semibold" fill={INK} fontSize={80}>
            {s}
          </text>
        ))}

        {/* x tick labels */}
        {[0, 4, 8, 12, 16, 20, 24, 26].map((v) => (
          <text key={v} x={X(v)} y={PT + ph + 105} textAnchor="middle" className="font-mono" fill={INK} fontSize={80}>
            {v}
          </text>
        ))}

        {/* legend: one row with the #10 chip, left of it */}
        <g transform={`translate(${PL + pw - 1240},65)`}>
          <rect width={90} height={90} fill="#f4d85a" stroke={INK} strokeWidth={8} />
          <text x={125} y={46} dominantBaseline="central" className="font-mono font-semibold" fill={INK} fontSize={80} letterSpacing={2}>
            labels
          </text>
          <rect x={520} width={90} height={90} fill="url(#db-hatch)" stroke={INK} strokeWidth={8} />
          <text x={651} y={46} dominantBaseline="central" className="font-mono font-semibold" fill={INK} fontSize={80} letterSpacing={2}>
            boxes
          </text>
        </g>

        {/* footer: caption in the card's 120px body size */}
        <text x={PL + pw / 2} y={H0 - 45} textAnchor="middle" className="font-mono" fill={INK} fontSize={120}>
          images per count (log)
        </text>
      </svg>
    </div>
  )
}

/* =====================================================================
   Results pile (cards #07–#15). All numbers from the paper's tex tables.
   Model families have one fixed colour each, used by every chart.
   ===================================================================== */
type Fam = 'mllm' | 'vlm' | 'sup'
const FAM: Record<Fam, { name: string; color: string }> = {
  mllm: { name: 'MLLMs', color: '#f4d85a' },
  vlm: { name: 'VLMs', color: RED },
  sup: { name: 'Supervised', color: '#2f6fe0' },
}
const FAMS: Fam[] = ['mllm', 'vlm', 'sup']
const GREEN = '#2aa876'
/* ink that follows the card: light on dark cards, reset to dark inside white chips/boxes */
const INKV = 'var(--color-ink)'
const ON_WHITE = { '--color-ink': '#141414' } as CSSProperties

/* per model: ImGT / ReGT acc on A\N (Tab. 1), sub = S+ S− M+ M− (Tab. 1),
   attr = Δ vs S for crowd, reflection, rendition, text, mix, none (Tab. 2),
   crops = Image, Largest, Any, All, ExCrops (Tab. 3), rank = acc vs i-th largest box on M (Suppl.) */
type ModelRow = {
  name: string
  fam: Fam
  imgt: number
  regt: number
  sub: number[]
  attr: number[]
  crops?: number[]
  rank: number[]
}
const MODELS: ModelRow[] = [
  {
    name: 'GPT-5.4',
    fam: 'mllm',
    imgt: 72.65,
    regt: 77.76,
    sub: [81.09, 46.47, 80.35, 40.55],
    attr: [0.46, -3.16, -3.05, 9.06, -6.62, -0.03],
    rank: [50.06, 26.22, 16.55, 11.03, 7.71],
  },
  {
    name: 'Qwen3-VL',
    fam: 'mllm',
    imgt: 71.09,
    regt: 77.23,
    sub: [79.09, 46.64, 82.26, 43.94],
    attr: [2.83, 0.41, -2.18, 15.05, 3.98, -0.32],
    rank: [51.76, 26.38, 16.4, 10.89, 7.99],
  },
  {
    name: 'Gemma 4',
    fam: 'mllm',
    imgt: 69.61,
    regt: 75.0,
    sub: [77.47, 45.93, 78.4, 43.07],
    attr: [3.4, -0.69, -2.29, 12.41, -6.57, -0.29],
    crops: [75.0, 69.78, 81.67, 61.7, 67.59],
    rank: [48.35, 25.93, 16.48, 11.25, 7.94],
  },
  {
    name: 'SigLIP',
    fam: 'vlm',
    imgt: 85.01,
    regt: 88.09,
    sub: [92.95, 43.69, 91.23, 38.35],
    attr: [1.66, 2.13, -3.71, 6.5, 2.59, -0.14],
    crops: [88.09, 81.86, 92.26, 71.51, 79.33],
    rank: [56.16, 30.2, 18.6, 12.46, 8.59],
  },
  {
    name: 'SigLIP 2',
    fam: 'vlm',
    imgt: 85.9,
    regt: 88.63,
    sub: [93.65, 43.16, 91.72, 38.11],
    attr: [0.6, 2.41, -3.61, 7.3, 0.89, -0.08],
    crops: [88.63, 82.14, 92.63, 71.69, 79.94],
    rank: [56.28, 30.53, 18.46, 12.24, 8.91],
  },
  {
    name: 'SigLIP 2 (g)',
    fam: 'vlm',
    imgt: 86.8,
    regt: 89.2,
    sub: [94.35, 42.63, 92.4, 37.24],
    attr: [-0.19, 3.59, -3.24, 6.37, 4.71, -0.04],
    crops: [89.2, 83.02, 93.51, 73.92, 80.93],
    rank: [56.49, 30.73, 18.65, 12.48, 8.62],
  },
  {
    name: 'DINOv3',
    fam: 'sup',
    imgt: 86.54,
    regt: 87.88,
    sub: [94.08, 36.06, 90.35, 31.65],
    attr: [2.74, 1.33, -6.43, 1.26, 2.23, -0.12],
    crops: [87.88, 78.78, 89.97, 57.04, 76.22],
    rank: [54.89, 30.02, 18.4, 12.46, 9.14],
  },
  {
    name: 'EfficientNetV2',
    fam: 'sup',
    imgt: 87.12,
    regt: 88.41,
    sub: [93.84, 36.98, 92.53, 30.0],
    attr: [1.55, 2.79, -10.3, -6.61, -3.13, 0.1],
    crops: [88.41, 80.03, 91.11, 65.75, 78.48],
    rank: [55.59, 31.1, 18.87, 12.41, 9.27],
  },
  {
    name: 'EfficientNet-L2',
    fam: 'sup',
    imgt: 89.84,
    regt: 90.71,
    sub: [96.02, 36.52, 95.47, 33.78],
    attr: [2.68, 0.4, -6.59, -4.38, -1.78, -0.04],
    crops: [90.71, 79.93, 90.92, 61.11, 78.89],
    rank: [57.37, 31.88, 19.9, 13.55, 9.87],
  },
  {
    name: 'EVA-02',
    fam: 'sup',
    imgt: 91.36,
    regt: 91.58,
    sub: [96.96, 35.84, 96.76, 31.34],
    attr: [2.96, 2.24, -4.33, 3.88, 2.92, -0.2],
    crops: [91.58, 81.06, 92.36, 59.67, 79.41],
    rank: [57.75, 32.49, 19.8, 13.53, 9.97],
  },
]
const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length
const famRows = (f: Fam) => MODELS.filter((m) => m.fam === f)
const famAvg = (f: Fam, get: (m: ModelRow) => number | undefined) => avg(famRows(f).flatMap((m) => (get(m) === undefined ? [] : [get(m)!])))
const signed = (v: number, d = 1) => `${v >= 0.05 ? '+' : v <= -0.05 ? '−' : ''}${Math.abs(v).toFixed(d)}`
const MONO_CH = 0.6 // IBM Plex Mono advance, in em

/* pushes label positions apart (keeps order), then re-centres them on the data */
function dodge(ys: number[], gap: number): number[] {
  const order = ys.map((_, i) => i).sort((a, b) => ys[a] - ys[b])
  const out = [...ys]
  for (let k = 1; k < order.length; k++) {
    const p = order[k - 1]
    const c = order[k]
    if (out[c] - out[p] < gap) out[c] = out[p] + gap
  }
  const shift = avg(ys.map((y, i) => y - out[i]))
  return out.map((y) => y + shift)
}

/* ---------- shared bits ---------- */
function Kicker({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="font-mono font-semibold uppercase text-ink/60" style={{ fontSize: 52, letterSpacing: 14, lineHeight: 1.2, ...style }}>
      {children}
    </div>
  )
}

function Prose({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="font-body font-semibold text-ink" style={{ fontSize: 74, lineHeight: 1.25, ...style }}>
      {children}
    </div>
  )
}

function FamSwatch({ f, size = 60 }: { f: Fam; size?: number }) {
  return <span className="inline-block shrink-0" style={{ width: size, height: size, background: FAM[f].color, border: `8px solid ${INKV}` }} />
}

function FamLegend({ extra, only, labels, size = 58 }: { extra?: ReactNode; only?: Fam[]; labels?: Partial<Record<Fam, string>>; size?: number }) {
  return (
    <div className="flex flex-wrap items-center whitespace-nowrap font-mono font-semibold text-ink" style={{ columnGap: 64, rowGap: 20, fontSize: size }}>
      {(only ?? FAMS).map((f) => (
        <span key={f} className="flex items-center" style={{ gap: 20 }}>
          <FamSwatch f={f} size={Math.round(size * 1.03)} />
          {labels?.[f] ?? FAM[f].name}
        </span>
      ))}
      {extra}
    </div>
  )
}

/* small subset chip, same tints as the Image-splits tree */
function SubsetChip({ code, size = 58 }: { code: string; size?: number }) {
  const bad = code.includes('−')
  return (
    <span
      className="inline-block whitespace-nowrap font-mono font-bold text-ink"
      style={{
        background: bad ? TONE.red : TONE.green,
        border: `8px solid ${INKV}`,
        padding: '4px 22px 2px',
        fontSize: size,
        lineHeight: 1.15,
      }}
    >
      {code}
    </span>
  )
}

/* ---------- #07 Classes & scoring ---------- */
/* the two label sets, as chips: ReGT (ours) in the poster's teal green, ImGT (original ImageNet-1k label) in paper white */
function GtChip({ k, size = 50, plain = false }: { k: 'ImGT' | 'ReGT'; size?: number; plain?: boolean }) {
  const ours = k === 'ReGT' && !plain
  return (
    <span
      className="inline-block shrink-0 whitespace-nowrap font-mono font-bold align-middle"
      style={{
        background: ours ? GREEN : '#f4efe6',
        color: ours ? '#fff' : '#141414',
        border: ours ? '6px solid transparent' : '6px solid #141414',
        padding: '6px 22px 4px',
        fontSize: size,
        letterSpacing: 2,
        lineHeight: 1.15,
      }}
    >
      {k}
    </span>
  )
}

/* reference to another card in running text: a small copy of that card's black #NN chip */
function CardRef({ n }: { n: number }) {
  return (
    <span
      className="inline-block whitespace-nowrap font-mono font-semibold align-middle"
      style={{
        background: '#141414',
        color: '#f4efe6',
        padding: '6px 26px 4px',
        fontSize: '0.82em',
        letterSpacing: 3,
        borderRadius: 14,
        lineHeight: 1.15,
      }}
    >
      #{String(n).padStart(2, '0')}
    </span>
  )
}

/* ImageNet class name, like the paper's \\cls{}: monospace on a light highlight, so it stands out from prose */
function Cls({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono font-semibold whitespace-nowrap" style={{ fontSize: '0.9em' }}>
      {children}
    </span>
  )
}

const CLASS_RULES: [string, ReactNode][] = [
  [
    'subclass',
    <>
      label the most specific class: <Cls>bathtub</Cls>, not <Cls>tub</Cls>
    </>,
  ],
  [
    'part-of',
    <>
      label both: <Cls>space bar</Cls> and <Cls>computer keyboard</Cls>
    </>,
  ],
  [
    'synonyms',
    <>
      annotators pick either, the final labels hold both:
      <br />
      <Cls>laptop</Cls> = <Cls>notebook</Cls>, <Cls>swimsuit</Cls> = <Cls>maillot</Cls>
    </>,
  ],
  [
    'multi-label box',
    <>
      one box, several labels: a <Cls>cardigan</Cls> made of <Cls>wool</Cls>
    </>,
  ],
  [
    'misnamed',
    <>
      define by content, not name: <Cls>tiger cat</Cls> holds tabby cats, oncillas and tigers;
      <br />
      <Cls>ear, spike</Cls> is mostly corn
    </>,
  ],
]

/* the paper's Eq. 1, typeset (serif italic variables), then explained term by term */
const MATH_FONT = "'IBM Plex Serif', 'STIX Two Text', 'Times New Roman', serif"
/* math variable with optional subscript and/or superscript, stacked right after it (inline, baseline-true) */
function MV({ children, sub, sup }: { children: ReactNode; sub?: ReactNode; sup?: ReactNode }) {
  return (
    <span style={{ fontStyle: 'italic', whiteSpace: 'nowrap' }}>
      {children}
      {sup && sub ? (
        // column baseline = the superscript's; raised so the subscript lands just below the main baseline
        <span
          className="inline-flex flex-col"
          style={{
            fontSize: '0.6em',
            lineHeight: 0.95,
            verticalAlign: '0.6em',
            marginLeft: '0.06em',
          }}
        >
          <span style={{ fontStyle: 'normal' }}>{sup}</span>
          <span>{sub}</span>
        </span>
      ) : sub ? (
        <span style={{ fontSize: '0.6em', verticalAlign: '-0.4em', marginLeft: '0.04em' }}>{sub}</span>
      ) : sup ? (
        <span
          style={{
            fontStyle: 'normal',
            fontSize: '0.6em',
            verticalAlign: '0.7em',
            marginLeft: '0.04em',
          }}
        >
          {sup}
        </span>
      ) : null}
    </span>
  )
}

/* Eq. 1 of the paper, display style: inline text lines, fraction on the math axis, sum limits underneath */
function ScoreFormula() {
  const op = (t: string) => <span style={{ margin: '0 0.28em' }}>{t}</span>
  return (
    <div
      className="flex flex-col items-center bg-white text-ink"
      style={{
        ...ON_WHITE,
        alignSelf: 'center',
        border: '10px solid #141414',
        padding: '50px 200px 46px',
        gap: 40,
        fontFamily: MATH_FONT,
        fontSize: 92,
        lineHeight: 1.15,
        whiteSpace: 'nowrap',
      }}
    >
      <div>
        Acc{op('=')}
        <span className="inline-flex flex-col items-center" style={{ fontSize: '0.8em', verticalAlign: '0.5em', margin: '0 0.12em' }}>
          <span>1</span>
          <span style={{ borderTop: '6px solid currentColor', padding: '0.04em 0.15em 0' }}>
            |<MV>I</MV>|
          </span>
        </span>
        <span className="inline-flex flex-col items-center" style={{ margin: '0 0.14em', lineHeight: 0.9, verticalAlign: '-0.2em' }}>
          <span style={{ fontSize: '1.75em' }}>∑</span>
          <span style={{ fontSize: '0.55em', marginTop: '0.55em', lineHeight: 1 }}>
            <MV>i</MV>∈<MV>I</MV>
          </span>
        </span>
        <MV sub="i">α</MV>
        <span style={{ display: 'inline-block', width: 150 }} />
        <MV sub="i">α</MV>
        {op('=')}[ <MV sub="i">p</MV>
        {op('∈')}
        <MV sub="i" sup="*">
          L
        </MV>{' '}
        ]
      </div>
      <div>
        <MV sub="i" sup="*">
          L
        </MV>
        {op('=')}
        <MV sub="i">L</MV>
        {op('∪')}
        {'{ '}
        <MV>b</MV>
        {op('|')}∃ <MV>a</MV>
        {op('∈')}
        <MV sub="i">L</MV>, {'{'}
        <MV>a</MV>, <MV>b</MV>
        {'}'}
        {op('∈')}
        <span style={{ fontStyle: 'normal' }}>ℰ</span>
        {' }'}
      </div>
    </div>
  )
}

const mathSym = (node: ReactNode) => (
  <span className="text-ink" style={{ fontFamily: MATH_FONT, fontSize: 80, lineHeight: 1 }}>
    {node}
  </span>
)
const SCORE_TERMS: [ReactNode, ReactNode][] = [
  [
    mathSym(<MV sub="i">p</MV>),
    <>
      the model’s top-1 prediction for image <i>i</i>
    </>,
  ],
  [mathSym(<MV sub="i">L</MV>), <>the image’s ReGT labels (several on multilabel images)</>],
  [
    mathSym(<span style={{ fontStyle: 'normal' }}>ℰ</span>),
    <>
      pairs of equivalent classes, e.g. <Cls>laptop</Cls> = <Cls>notebook</Cls>
    </>,
  ],
  [
    mathSym(
      <MV sub="i" sup="*">
        L
      </MV>,
    ),
    <>the labels plus every class equivalent to one of them</>,
  ],
  [mathSym(<MV sub="i">α</MV>), <>1 if the prediction is any of them: a multilabel image counts as correct for any of its labels</>],
  [mathSym(<MV>I</MV>), <>the scored images: all except the 2,016 with no ImageNet-1k object (N), so 47,984 for ImGT and ReGT</>],
]

const KICK_SENTENCE: CSSProperties = { textTransform: 'none', letterSpacing: 3, fontSize: 60 }

/* the problems we met while annotating, one line each: rule + example */
const CLASS_PROBLEMS: [string, ReactNode][] = [
  ['subclass', <>label the most specific: <Cls>bathtub</Cls>, not <Cls>tub</Cls></>],
  ['part-of', <>label both: <Cls>space bar</Cls> and <Cls>computer keyboard</Cls></>],
  ['synonyms', <>keep both names: <Cls>laptop</Cls> = <Cls>notebook</Cls></>],
  ['multi-label box', <>added midway: a <Cls>cardigan</Cls> made of <Cls>wool</Cls></>],
  ['misnamed', <>class = its content: <Cls>tiger cat</Cls> holds tabby cats, oncillas, tigers</>],
]

function ClassesCard() {
  return (
    <div className="absolute flex flex-col" style={{ left: 130, right: 130, top: 60, gap: 26 }}>
      {/* alternating stripes keep the close rows apart */}
      <div className="flex flex-col" style={{ marginLeft: -24, marginRight: -24 }}>
        {CLASS_PROBLEMS.map(([k, t], i) => (
          <div key={k} className="flex items-center" style={{ gap: 44, padding: '34px 24px', background: i % 2 === 0 ? 'rgba(255,255,255,0.55)' : 'transparent' }}>
            <div
              className="shrink-0 bg-white text-center font-mono font-bold text-ink"
              style={{ ...ON_WHITE, width: 960, border: '10px solid #141414', padding: '14px 0 12px', fontSize: 96, lineHeight: 1.15 }}
            >
              {k}
            </div>
            <Prose style={{ fontSize: 120, lineHeight: 1.12 }}>{t}</Prose>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- #08 How we score: ReaL accuracy, the paper's Eq. 1 explained term by term ---------- */
/* ---------- #09 Accuracy on ReGT: dumbbells + subset slopes ---------- */
function AccDumbbell() {
  const W0 = 3960
  const PL = 1000,
    PR = 3400,
    D0 = 68,
    D1 = 93
  const X = (v: number) => PL + ((v - D0) / (D1 - D0)) * (PR - PL)
  const ROW = 136,
    GAP = 54,
    TOP = 30
  let y = TOP
  const rows = MODELS.map((m, i) => {
    if (i > 0 && MODELS[i - 1].fam !== m.fam) y += GAP
    const r = { m, top: y, cy: y + ROW / 2 }
    y += ROW
    return r
  })
  const axisY = y + 24
  const H0 = axisY + 120
  return (
    <svg className="text-ink" width={W0} height={H0} style={{ display: 'block', overflow: 'visible' }}>
      {/* one tinted band per model group (3 colours, not 2 alternating) */}
      {FAMS.map((f) => {
        const rs = rows.filter((r) => r.m.fam === f)
        const t = rs[0].top - GAP / 2 + 4
        const b = rs[rs.length - 1].top + ROW + GAP / 2 - 4
        return <rect key={`band${f}`} x={-20} y={t} width={W0 + 40} height={b - t} fill={FAM[f].color} fillOpacity={f === 'mllm' ? 0.28 : 0.13} />
      })}
      {[70, 75, 80, 85, 90].map((v) => (
        <line key={v} x1={X(v)} y1={TOP - 10} x2={X(v)} y2={axisY} stroke="currentColor" strokeOpacity={0.14} strokeWidth={5} strokeDasharray="18 18" />
      ))}
      {FAMS.map((f) => {
        const rs = rows.filter((r) => r.m.fam === f)
        const t = rs[0].top + 8
        const b = rs[rs.length - 1].top + ROW - 8
        return (
          <g key={f}>
            <rect x={0} y={t} width={100} height={b - t} fill={FAM[f].color} stroke="currentColor" strokeWidth={7} />
            <text transform={`translate(50,${(t + b) / 2}) rotate(-90)`} textAnchor="middle" dominantBaseline="central" className="font-mono font-semibold" fill={f === 'mllm' ? INK : '#fff'} fontSize={64} letterSpacing={2}>
              {FAM[f].name}
            </text>
          </g>
        )
      })}
      {rows.map(({ m, cy }) => (
        <g key={m.name}>
          <text x={146} y={cy} dominantBaseline="central" className="font-body font-semibold" fill="currentColor" fontSize={82}>
            {m.name}
          </text>
          <line x1={X(m.imgt)} y1={cy} x2={X(m.regt)} y2={cy} stroke="currentColor" strokeWidth={40} />
          <line x1={X(m.imgt)} y1={cy} x2={X(m.regt)} y2={cy} stroke={FAM[m.fam].color} strokeWidth={24} />
          <circle cx={X(m.imgt)} cy={cy} r={30} fill="#fff" stroke="currentColor" strokeWidth={9} />
          <circle cx={X(m.regt)} cy={cy} r={36} fill={FAM[m.fam].color} stroke="currentColor" strokeWidth={9} />
          <text x={X(m.regt) + 66} y={cy} dominantBaseline="central" className="font-mono font-semibold" fill="currentColor" fontSize={74}>
            {signed(m.regt - m.imgt, 2)}
          </text>
        </g>
      ))}
      <line x1={PL - 30} y1={axisY} x2={PR + 30} y2={axisY} stroke="currentColor" strokeWidth={9} />
      {[70, 75, 80, 85, 90].map((v) => (
        <text key={v} x={X(v)} y={axisY + 72} textAnchor="middle" className="font-mono" fill="currentColor" fontSize={72}>
          {v}
        </text>
      ))}
    </svg>
  )
}

function SubsetSlope() {
  const W0 = 3960 // = the card's inner width, so the gap between the two groups sits at the card's middle (x = 1980)
  const XS = [730, 1530, 2430, 3230] // S+, S−, M+, M−
  const PT = 150,
    PB = 880,
    D0 = 25,
    D1 = 100
  const Y = (v: number) => PB - ((v - D0) / (D1 - D0)) * (PB - PT)
  const H0 = PB + 190
  const data = FAMS.map((f) => ({ f, v: [0, 1, 2, 3].map((k) => famAvg(f, (m) => m.sub[k])) }))
  const lab = [0, 1, 2, 3].map((k) =>
    dodge(
      data.map((d) => Y(d.v[k])),
      80,
    ),
  )
  const codes = ['S+', 'S−', 'M+', 'M−']
  return (
    <svg className="text-ink" width={W0} height={H0} style={{ display: 'block', overflow: 'visible' }}>
      <text x={(XS[0] + XS[1]) / 2} y={64} textAnchor="middle" className="font-mono font-semibold" fill="currentColor" fontSize={90} letterSpacing={5}>
        SINGLE-LABEL
      </text>
      <text x={(XS[2] + XS[3]) / 2} y={64} textAnchor="middle" className="font-mono font-semibold" fill="currentColor" fontSize={90} letterSpacing={5}>
        MULTI-LABEL
      </text>
      {XS.map((x, k) => (
        <g key={k}>
          <line x1={x} y1={PT - 40} x2={x} y2={PB + 20} stroke="currentColor" strokeOpacity={0.22} strokeWidth={8} />
          <rect x={x - 100} y={PB + 45} width={200} height={110} fill={k % 2 ? TONE.red : TONE.green} stroke="currentColor" strokeWidth={8} />
          <text x={x} y={PB + 100} textAnchor="middle" dominantBaseline="central" className="font-mono font-bold" fill="currentColor" fontSize={80}>
            {codes[k]}
          </text>
        </g>
      ))}
      {/* single models, thin and faded, behind the family means */}
      {MODELS.map((m) => [0, 2].map((k) => <line key={`${m.name}${k}`} x1={XS[k]} y1={Y(m.sub[k])} x2={XS[k + 1]} y2={Y(m.sub[k + 1])} stroke={FAM[m.fam].color} strokeOpacity={0.55} strokeWidth={9} />))}
      {[...data].reverse().map(({ f, v }) =>
        [0, 2].map((k) => (
          <g key={`${f}${k}`}>
            <line x1={XS[k]} y1={Y(v[k])} x2={XS[k + 1]} y2={Y(v[k + 1])} stroke="currentColor" strokeWidth={42} strokeLinecap="round" />
            <line x1={XS[k]} y1={Y(v[k])} x2={XS[k + 1]} y2={Y(v[k + 1])} stroke={FAM[f].color} strokeWidth={24} strokeLinecap="round" />
          </g>
        )),
      )}
      {data
        .map((d, i) => ({ ...d, i }))
        .reverse()
        .map(({ f, v, i }) =>
        [0, 1, 2, 3].map((k) => (
          <g key={`${f}d${k}`}>
            <circle cx={XS[k]} cy={Y(v[k])} r={36} fill={FAM[f].color} stroke="currentColor" strokeWidth={10} />
            <text x={k % 2 ? XS[k] + 68 : XS[k] - 68} y={lab[k][i]} textAnchor={k % 2 ? 'start' : 'end'} dominantBaseline="central" className="font-mono font-semibold" fill="currentColor" fontSize={68}>
              {v[k].toFixed(1)}
            </text>
          </g>
        )),
      )}
    </svg>
  )
}

/* what the slopes say: the ranking flips between S+ and S−, and supervised models drop the most */
function FlipCallouts() {
  const sm = (f: Fam, k: number) => famAvg(f, (m) => m.sub[k])
  const box = (head: ReactNode, body: ReactNode) => (
    <div
      className="flex"
      style={{
        ...ON_WHITE,
        background: '#f4efe6',
        border: '10px solid #141414',
        padding: '26px 40px 30px',
        gap: 40,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <div className="shrink-0">{head}</div>
      <div className="font-body font-semibold text-ink" style={{ fontSize: 120, lineHeight: 1.15 }}>
        {body}
      </div>
    </div>
  )
  return (
    <div className="flex flex-col" style={{ minWidth: 0, gap: 40, marginTop: 150 }}>
      {box(
        <SubsetChip code="S+" size={96} />,
        <>
          <b>Supervised lead:</b> {sm('sup', 0).toFixed(1)} vs. {sm('mllm', 0).toFixed(1)} for MLLMs
        </>,
      )}
      {box(
        <SubsetChip code="S−" size={96} />,
        <>
          <b>MLLMs lead:</b> {sm('mllm', 1).toFixed(1)} vs. {sm('sup', 1).toFixed(1)} for supervised: the ranking flips
        </>,
      )}
      {box(
        <span className="flex items-center" style={{ gap: 22 }}>
          <SubsetChip code="S+" size={96} />
          <svg width={110} height={60} viewBox="0 0 110 60" style={{ display: 'block' }}>
            <path d="M 4 30 H 84" stroke={INKV} strokeWidth={12} strokeLinecap="butt" fill="none" />
            <polygon points="104,30 78,8 78,52" fill={INKV} />
          </svg>
          <SubsetChip code="S−" size={96} />
        </span>,
        <>
          supervised models lose <b>{(sm('sup', 0) - sm('sup', 1)).toFixed(0)} pp</b>, MLLMs only <b>{(sm('mllm', 0) - sm('mllm', 1)).toFixed(0)} pp</b>
        </>,
      )}
    </div>
  )
}

function AccuracyCard() {
  const ring = (fill: string, r: number) => (
    <span
      className="inline-block"
      style={{
        width: r,
        height: r,
        borderRadius: '50%',
        background: fill,
        border: `9px solid ${INKV}`,
      }}
    />
  )
  return (
    <div className="absolute flex flex-col" style={{ left: 120, right: 120, top: 90, bottom: 80, gap: 40 }}>
      {/* narrower than the card, so it stays clear of the (ii) / #10 chips while it sits near the top edge */}
      <Prose style={{ fontSize: 120 }}>We measure ReaL accuracy (Beyer et al., 2020).</Prose>
      <Prose style={{ fontSize: 120, marginBottom: 50 }}>
        MLLMs gain +5–6 pp, supervised models +0.2–1.3:
        <br />
        models less reliant on supervised ImageNet labels are more sensitive to label quality.
      </Prose>
      <FamLegend
        size={80}
        extra={
          <span className="flex items-center" style={{ gap: 44 }}>
            <span className="flex items-center" style={{ gap: 18 }}>
              {ring('#fff', 80)} ImGT
            </span>
            <span className="flex items-center" style={{ gap: 18 }}>
              {ring('#8a8781', 88)} ReGT
            </span>
          </span>
        }
      />
      <AccDumbbell />
      <Prose style={{ fontSize: 120, marginTop: 50, marginBottom: 60 }}>
        Where ImGT is wrong (<SubsetChip code="S−" size={96} />, <SubsetChip code="M−" size={96} />
        ), all families drop to 30–47%.
      </Prose>
      <SubsetSlope />
      <FlipCallouts />
    </div>
  )
}

/* ---------- #10 Attribute effect ---------- */
const ATTR_ROWS = [
  { name: 'crowd', n: '1,945', color: ATTR.crowd },
  { name: 'reflection', n: '227', color: ATTR.reflection },
  { name: 'rendition', n: '424', color: ATTR.rendition },
  { name: 'text-recognition', n: '287', color: ATTR.text },
  { name: 'mix', n: '91', color: '#5d5a55' },
  { name: 'none', n: '29,059', color: '#5d5a55' },
]

/* Δ accuracy vs. S on the images with the attribute, family means only: three tiles under the attribute's example */
const STAT_MAX = 15
const statFill = (v: number) => `color-mix(in srgb, ${v >= 0 ? GREEN : RED} ${Math.round(18 + Math.min(Math.abs(v) / STAT_MAX, 1) * 72)}%, #fff)`

function AttrStats({ g }: { g: number }) {
  return (
    <div className="flex items-stretch" style={{ gap: 20 }}>
      {FAMS.map((f) => {
        const mean = avg(famRows(f).map((m) => m.attr[g]))
        return (
          <div key={f} className="flex flex-1 flex-col items-center" style={{ background: statFill(mean), border: `6px solid ${INK}`, padding: '14px 0 10px', gap: 0 }}>
            <span className="font-mono font-semibold" style={{ color: INK, fontSize: 64, lineHeight: 1.1 }}>
              {FAM[f].name}
            </span>
            <span className="font-mono font-bold" style={{ color: INK, fontSize: 120, lineHeight: 1.1 }}>
              {signed(mean)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ---------- #11 One benchmark, many tasks: crops + box rank ---------- */
const CROP_COLS = [
  { name: 'Image', n: '47,984' },
  { name: 'Largest', n: '47,984' },
  { name: 'Any', n: '47,984' },
  { name: 'All', n: '95,165' },
  { name: 'ExCrops', n: '38,439' },
]

/* tiny protocol glyph: an image with a big and a small object box; what gets classified is filled */
function CropGlyph({ k, cx, y }: { k: number; cx: number; y: number }) {
  const S = 1.8 // glyph scale (strokes scale with it)
  const W = 200,
    H = 150
  const on = 'rgba(20,20,20,0.32)'
  const A = { x: 16, y: 30, w: 108, h: 104 }
  const B = { x: 140, y: 40, w: 44, h: 50 }
  const fillA = k === 1 || k === 2 || k === 3 ? on : 'none'
  const fillB = k === 2 || k === 3 || k === 4 ? on : 'none'
  return (
    <g transform={`translate(${cx - (W * S) / 2},${y}) scale(${S})`}>
      <rect x={0} y={0} width={W} height={H} fill={k === 0 ? on : '#fff'} stroke={INK} strokeWidth={7} />
      {/* ExCrops: every object gets its own expanded crop, stopped where the next box begins -> several crops per image */}
      {k === 4 && <rect x={7} y={6} width={120} height={H - 12} fill="rgba(20,20,20,0.1)" stroke={INK} strokeWidth={6} strokeDasharray="12 9" />}
      {k === 4 && <rect x={133} y={6} width={60} height={H - 12} fill="rgba(20,20,20,0.2)" stroke={INK} strokeWidth={6} strokeDasharray="12 9" />}
      <rect {...{ x: A.x, y: A.y, width: A.w, height: A.h }} fill={fillA} stroke={INK} strokeWidth={k === 0 || k === 4 ? 4 : 8} />
      <rect {...{ x: B.x, y: B.y, width: B.w, height: B.h }} fill={fillB} stroke={INK} strokeWidth={k === 0 || k === 1 ? 4 : 8} />
      {k === 2 && (
        <text x={W / 2} y={H + 6} textAnchor="middle" dominantBaseline="hanging" className="font-mono font-bold" fill="currentColor" fontSize={42}>
          ≥1 right
        </text>
      )}
      {k === 4 && (
        <text x={W / 2} y={H + 6} textAnchor="middle" dominantBaseline="hanging" className="font-mono font-bold" fill="currentColor" fontSize={42}>
          1 per object
        </text>
      )}
    </g>
  )
}

function CropLines() {
  const W0 = 3960
  const XS = [480, 1230, 1980, 2730, 3480] // middle column = middle of the card (inner width 3960)
  const PT = 720,
    PB = 1530,
    D0 = 55,
    D1 = 95
  const Y = (v: number) => PB - ((v - D0) / (D1 - D0)) * (PB - PT)
  const H0 = PB + 40
  const data = FAMS.map((f) => ({
    f,
    v: [0, 1, 2, 3, 4].map((k) => famAvg(f, (m) => m.crops?.[k])),
  }))
  const left = dodge(
    data.map((d) => Y(d.v[0])),
    66,
  )
  const right = dodge(
    data.map((d) => Y(d.v[4])),
    66,
  )
  const mid = dodge(
    data.map((d) => Y(d.v[3])),
    66,
  )
  return (
    <svg className="text-ink" width={W0} height={H0} style={{ display: 'block', overflow: 'visible', marginTop: 90 }}>
      {CROP_COLS.map((c, k) => (
        <g key={c.name}>
          <CropGlyph k={k} cx={XS[k]} y={0} />
          <text x={XS[k]} y={455} textAnchor="middle" className="font-mono font-semibold" fill="currentColor" fontSize={84}>
            {c.name}
          </text>
          <text x={XS[k]} y={535} textAnchor="middle" className="font-mono" fill="currentColor" fillOpacity={0.7} fontSize={62}>
            {c.n}
          </text>
          <line x1={XS[k]} y1={PT - 60} x2={XS[k]} y2={PB} stroke="currentColor" strokeOpacity={0.2} strokeWidth={7} />
        </g>
      ))}
      {[60, 70, 80, 90].map((v) => (
        <line key={v} x1={XS[0]} y1={Y(v)} x2={XS[4]} y2={Y(v)} stroke="currentColor" strokeOpacity={0.12} strokeWidth={5} strokeDasharray="18 18" />
      ))}
      {data.map(({ f, v }) => {
        const pts = v.map((val, k) => `${XS[k]},${Y(val)}`).join(' ')
        return (
          <g key={f}>
            <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={36} strokeLinejoin="round" strokeLinecap="round" />
            <polyline points={pts} fill="none" stroke={FAM[f].color} strokeWidth={20} strokeLinejoin="round" strokeLinecap="round" />
            {v.map((val, k) => (
              <circle key={k} cx={XS[k]} cy={Y(val)} r={28} fill={FAM[f].color} stroke="currentColor" strokeWidth={8} />
            ))}
          </g>
        )
      })}
      {data.map(({ f, v }, i) => (
        <g key={`l${f}`} className="font-mono font-semibold" fill="currentColor" fontSize={72}>
          <text x={XS[0] - 56} y={left[i]} textAnchor="end" dominantBaseline="central">
            {v[0].toFixed(1)}
          </text>
          <text x={XS[3] + 56} y={mid[i] + 40} dominantBaseline="central">
            {v[3].toFixed(1)}
          </text>
          {/* Largest and Any: the top line's value sits above its point, the others below (the lines are close together) */}
          {[1, 2].map((c) => {
            const top = data.reduce((best, d, j) => (d.v[c] > data[best].v[c] ? j : best), 0)
            return (
              <text key={c} x={XS[c]} y={i === top ? Y(v[c]) - 66 : Y(v[c]) + 86} textAnchor="middle" dominantBaseline="central" stroke="#e3e0d7" strokeWidth={12} paintOrder="stroke">
                {v[c].toFixed(1)}
              </text>
            )
          })}
          <text x={XS[4] + 56} y={right[i]} dominantBaseline="central">
            {v[4].toFixed(1)}
          </text>
        </g>
      ))}
    </svg>
  )
}

const TASKS = ['classification', 'object crops', 'detection', 'localization', 'counting', 'explainability']

function TasksCard() {
  return (
    <div className="absolute flex flex-col" style={{ left: 120, right: 120, top: 70, gap: 24 }}>
      {/* text stays left of the #06 chip (top right) */}
      {/* first sentence on a single row: fitted to the width left of the chip (max = the 120px body size) */}
      <FitLine target={3560} max={120} className="font-body font-semibold text-ink" style={{ lineHeight: 1.25 }}>
        Classification stays the default, as in ImageNet, <span className="font-bold">now split per subset</span>.
      </FitLine>
      <Prose style={{ fontSize: 120, marginTop: 12, marginBottom: 20 }}>The boxes make many other tasks possible:</Prose>
      {/* comic-style task stickers: 2 x 3, hard shadow, slight tilts; */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 30, marginTop: 0, paddingRight: 14 }}>
        {TASKS.map((t, i) => (
          <div
            key={t}
            className="flex items-center font-mono font-bold text-ink"
            style={{
              ...ON_WHITE,
              background: '#fff',
              border: '12px solid #141414',
              boxShadow: '14px 14px 0 #141414',
              transform: `rotate(${[-1.2, 1, 0.8, -1, -0.8, 1.2][i]}deg)`,
              padding: '26px 36px 22px 32px',
              gap: 34,
              fontSize: 112,
              lineHeight: 1.1,
              whiteSpace: 'nowrap',
            }}
          >
            <span
              className="inline-flex shrink-0 items-center justify-center"
              style={{
                width: 128,
                height: 128,
                border: '11px solid #141414',
                borderRadius: '50%',
                background: RED,
                color: '#fff',
                fontSize: 88,
                lineHeight: 1,
              }}
            >
              ✓
            </span>
            {t}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- Recognition on object crops (the plot half of the old card 12) ---------- */
function CropsCard() {
  return (
    <div className="absolute flex flex-col" style={{ left: 120, right: 120, top: 100, gap: 30 }}>
      <Prose style={{ fontSize: 120, marginBottom: 50 }}>Beyond full-image classification,<br />we also run the object crops recognition task, scored by five protocols:</Prose>
      <CropLines />
      <FamLegend size={80} />
      <Prose style={{ fontSize: 120, marginTop: 70 }}>
        Any − Largest ≈ 11 pp: models often miss the largest object yet get a smaller one.
        <br />
        Without context (All), supervised models lose 29 pp, MLLMs 13.
      </Prose>
    </div>
  )
}

/* ---------- #12 Errors in derived benchmarks ---------- */
const DERIVED = [
  { name: 'ImageNetV2', a: 4.59, b: 11.15, n: 446 },
  { name: 'ImageNet-A', a: 2.52, b: 14.8, n: 435 },
  { name: 'ImageNet-R', a: 2.9, b: 4.99, n: 472 },
  { name: 'ImageNet-Sketch', a: 4.59, b: 13.38, n: 2911 },
  { name: 'ObjectNet', a: 5.11, b: 8.96, n: 459 },
  { name: 'CounterAnimal', a: 1.91, b: 4.76, n: 298 },
]

function DerivedBars() {
  const W0 = 3960
  const PL = 880,
    PR = 2700,
    D1 = 16
  const X = (v: number) => PL + (v / D1) * (PR - PL)
  const TOP = 160,
    ROW = 260
  const H0 = TOP + DERIVED.length * ROW
  return (
    <svg className="text-ink" width={W0} height={H0} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <pattern id="dv-hatch" width="30" height="30" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="30" height="30" fill="#fff" />
          <rect width="14" height="30" fill="rgba(20,20,20,0.35)" />
        </pattern>
      </defs>
      <text x={(PL + PR) / 2} y={70} textAnchor="middle" className="font-mono" fill="currentColor" fontSize={90}>
        estimated label error (%)
      </text>
      <text x={3070} y={70} textAnchor="middle" className="font-mono" fill="currentColor" fontSize={90}>
        ratio
      </text>
      <text x={W0} y={70} textAnchor="end" className="font-mono" fill="currentColor" fontSize={90}>
        est. wrong
      </text>
      {DERIVED.map((d, i) => {
        const y = TOP + i * ROW
        return (
          <g key={d.name}>
            {i % 2 === 0 && <rect x={-20} y={y} width={W0 + 40} height={ROW} fill="currentColor" fillOpacity={0.05} />}
            <text x={0} y={y + ROW / 2} dominantBaseline="central" className="font-body font-semibold" fill="currentColor" fontSize={96}>
              {d.name}
            </text>
            <rect x={PL} y={y + 36} width={X(d.a) - PL} height={72} fill="url(#dv-hatch)" stroke="currentColor" strokeWidth={6} />
            <text x={X(d.a) + 22} y={y + 72} dominantBaseline="central" className="font-mono" fill="currentColor" fontSize={80}>
              {d.a.toFixed(1)}
            </text>
            <rect x={PL} y={y + 124} width={X(d.b) - PL} height={96} fill={RED} stroke="currentColor" strokeWidth={7} />
            <text x={X(d.b) + 22} y={y + 172} dominantBaseline="central" className="font-mono font-semibold" fill="currentColor" fontSize={90}>
              {d.b.toFixed(1)}
            </text>
            <text x={3070} y={y + ROW / 2} textAnchor="middle" dominantBaseline="central" className="font-mono font-bold" fill="currentColor" fontSize={96}>
              ×{(d.b / d.a).toFixed(1)}
            </text>
            <text x={W0} y={y + ROW / 2} textAnchor="end" dominantBaseline="central" className="font-body font-bold" fill="currentColor" fontSize={104}>
              {d.n.toLocaleString('en-US')}
            </text>
          </g>
        )
      })}
      <line x1={PL} y1={TOP - 10} x2={PL} y2={H0} stroke="currentColor" strokeWidth={8} />
    </svg>
  )
}

function DerivedCard() {
  return (
    // text and plot stay together at the top; the take-away sits at the bottom
    <div className="absolute flex flex-col" style={{ left: 120, right: 120, top: 140, gap: 50 }}>
      <div className="flex flex-col" style={{ gap: 60 }}>
        <div className="flex flex-col" style={{ gap: 26 }}>
          {/* one phrase; kept clear of the (iii) / #13 chips on the right */}
          <div className="whitespace-nowrap font-body font-semibold text-ink" style={{ fontSize: 120, lineHeight: 1.25 }}>
            <div>
              <span className="font-bold">Empirical lower-bound estimate of annotation error,</span> from the
            </div>
            <div>
              answers two models with uncorrelated error patterns agree on <span className="font-mono font-bold">ReGT</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center whitespace-nowrap font-mono font-semibold text-ink" style={{ columnGap: 60, rowGap: 16, fontSize: 90, marginTop: 110 }}>
            <span className="flex items-center" style={{ gap: 18 }}>
              <span
                style={{
                  width: 72,
                  height: 72,
                  border: `8px solid ${INKV}`,
                  background: 'repeating-linear-gradient(45deg, rgba(20,20,20,0.35) 0 10px, #fff 10px 21px)',
                }}
              />
              on ImageNet-1k (same classes as the benchmark subset)
            </span>
            <span className="flex items-center" style={{ gap: 18 }}>
              <span style={{ width: 72, height: 72, border: `8px solid ${INKV}`, background: RED }} />
              on the benchmark
            </span>
          </div>
        </div>
        <DerivedBars />
      </div>
      <Prose style={{ fontSize: 120, marginTop: 110 }}>Adopting the ImageNet-1k class structure on newly collected images brings the same problems with the classes, and hence with correct image-label pair collection and annotation.</Prose>
    </div>
  )
}

/* ---------- #13 vs. prior reannotations ---------- */
const PRIOR_ML = [
  { name: 'ReImageNet', v: 31.9, n: '50,000', ours: true },
  { name: 'ImageNetMultiLabel', v: 21.6, n: '10,000' },
  { name: 'Multi-label ann.', v: 18.3, n: '20,000' },
  { name: 'ReaL', v: 14.9, n: '50,000' },
  { name: 'Label Errors', v: 11.0, n: '5,440' },
]
/* S− accuracy of GPT-5.4, Qwen3-VL, Gemma 4, EVA-02: against the prior set's labels (a) vs ReGT (b) */
function PriorMlBars() {
  const W0 = 5360
  const PL = 1450,
    PR = 4250,
    D1 = 35
  const X = (v: number) => PL + (v / D1) * (PR - PL)
  const ROW = 135
  const H0 = PRIOR_ML.length * ROW
  return (
    <svg className="text-ink" width={W0} height={H0} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <pattern id="pr-hatch" width="30" height="30" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="30" height="30" fill="#fff" />
          <rect width="14" height="30" fill="rgba(20,20,20,0.35)" />
        </pattern>
      </defs>
      {PRIOR_ML.map((d, i) => {
        const cy = i * ROW + ROW / 2
        return (
          <g key={d.name}>
            <text x={0} y={cy} dominantBaseline="central" className={d.ours ? 'font-body font-bold' : 'font-body font-semibold'} fill="currentColor" fontSize={104}>
              {d.name}
            </text>
            <rect x={PL} y={cy - 55} width={X(d.v) - PL} height={110} fill={d.ours ? '#f4d85a' : 'url(#pr-hatch)'} stroke="currentColor" strokeWidth={7} />
            <text x={X(d.v) + 26} y={cy} dominantBaseline="central" className="font-mono font-semibold" fill="currentColor" fontSize={104}>
              {d.v.toFixed(1)}%
            </text>
            <text x={W0} y={cy} textAnchor="end" dominantBaseline="central" className="font-mono font-semibold" fill="currentColor" fillOpacity={0.8} fontSize={104}>
              of {d.n}
            </text>
          </g>
        )
      })}
      <line x1={PL} y1={0} x2={PL} y2={H0} stroke="currentColor" strokeWidth={8} />
    </svg>
  )
}

/* ReaL -> ReGT label flow (paper Suppl. alluvial, redrawn in poster style).
   Node totals are the paper's labels; the flow sizes are read off the paper's figure (thickness at the ReGT side,
   fitted to those totals), so they are accurate to roughly 1-2 %. Rows = ReaL category, columns = ReGT category. */
const FLOW_ORDER = ['M−', 'M+', 'S−', 'S+', 'N'] as const
const FLOW_LEFT = [995, 6448, 3678, 35716, 3163]
const FLOW_RIGHT = [1270, 14681, 2815, 29218, 2016]
const FLOW: number[][] = [
  [284, 426, 143, 107, 36],
  [298, 3814, 389, 1795, 152],
  [300, 780, 1086, 1145, 368],
  [268, 9183, 776, 24610, 880],
  [120, 479, 421, 1562, 581],
]
const FLOW_COLOR: Record<string, string> = {
  'M−': '#f0a79d',
  'M+': '#8fd6bd',
  'S−': RED,
  'S+': GREEN,
  N: '#9a968e',
}

function AlluvialReal({ k = 1 }: { k?: number }) {
  const W0 = 2300
  const TOP = 220,
    AVAIL = 1110,
    GAP = 40
  const K = (AVAIL - 4 * GAP) / 50000
  const XL = 500,
    XR = 1740,
    BW = 70
  const place = (tot: number[]) => {
    let y = TOP
    return tot.map((v) => {
      const seg = { y, h: v * K }
      y += v * K + GAP
      return seg
    })
  }
  const L = place(FLOW_LEFT)
  const R = place(FLOW_RIGHT)
  const lo = L.map((n) => n.y) // running offsets inside the nodes
  const ro = R.map((n) => n.y)
  const ribbons = FLOW.flatMap((row, i) =>
    row.map((v, j) => {
      const h = v * K
      const sa = lo[i],
        da = ro[j]
      lo[i] += h
      ro[j] += h
      const xm = (XL + BW + XR) / 2
      return {
        i,
        j,
        d: `M ${XL + BW} ${sa} C ${xm} ${sa} ${xm} ${da} ${XR} ${da} L ${XR} ${da + h} C ${xm} ${da + h} ${xm} ${sa + h} ${XL + BW} ${sa + h} Z`,
      }
    }),
  )
  const lab = (nodes: { y: number; h: number }[]) =>
    dodge(
      nodes.map((n) => n.y + n.h / 2),
      74,
    )
  const ll = lab(L),
    rl = lab(R)
  const H0 = TOP + AVAIL + 20
  const fmt = (v: number) => v.toLocaleString('en-US')
  return (
    <svg className="text-ink" width={W0 * k} height={H0 * k} viewBox={`0 0 ${W0} ${H0}`} style={{ display: 'block', overflow: 'visible', alignSelf: 'center' }}>
      <text x={XL + BW / 2} y={140} textAnchor="middle" className="font-body font-bold" fill="currentColor" fontSize={62}>
        ImageNet ReaL
      </text>
      <text x={XR + BW / 2} y={140} textAnchor="middle" className="font-body font-bold" fill="currentColor" fontSize={62}>
        ReImageNet
      </text>
      {ribbons.map((r) => (
        <path key={`${r.i}${r.j}`} d={r.d} fill={FLOW_COLOR[FLOW_ORDER[r.i]]} fillOpacity={0.5} />
      ))}
      {FLOW_ORDER.map((k, i) => (
        <g key={k}>
          <rect x={XL} y={L[i].y} width={BW} height={Math.max(L[i].h, 6)} fill={FLOW_COLOR[k]} stroke="currentColor" strokeWidth={7} />
          <rect x={XR} y={R[i].y} width={BW} height={Math.max(R[i].h, 6)} fill={FLOW_COLOR[k]} stroke="currentColor" strokeWidth={7} />
          <text x={XL - 26} y={ll[i]} textAnchor="end" dominantBaseline="central" className="font-mono font-semibold" fill="currentColor" fontSize={62}>
            <tspan className="font-bold">{k}</tspan> {fmt(FLOW_LEFT[i])}
          </text>
          <text x={XR + BW + 26} y={rl[i]} textAnchor="start" dominantBaseline="central" className="font-mono font-semibold" fill="currentColor" fontSize={62}>
            {fmt(FLOW_RIGHT[i])} <tspan className="font-bold">{k}</tspan>
          </text>
        </g>
      ))}
    </svg>
  )
}

/* one row: where the prior efforts' multi-label ratios sit (11-22 %) vs ours (31.9 %) */
function MultilabelStrip() {
  const W0 = 5340,
    X0 = 300,
    X1 = 4700,
    D1 = 35
  const X = (v: number) => X0 + (v / D1) * (X1 - X0)
  const prior = PRIOR_ML.filter((d) => !d.ours)
  const lo = Math.min(...prior.map((d) => d.v))
  const hi = Math.max(...prior.map((d) => d.v))
  const ours = PRIOR_ML.find((d) => d.ours)!
  const AY = 200
  return (
    <svg className="text-ink" width={W0} height={400} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <pattern id="ml-hatch" width="30" height="30" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="30" height="30" fill="#fff" />
          <rect width="14" height="30" fill="rgba(20,20,20,0.35)" />
        </pattern>
      </defs>
      <line x1={X0} y1={AY} x2={X1} y2={AY} stroke="currentColor" strokeWidth={8} />
      {[0, 10, 20, 30].map((v) => (
        <g key={v}>
          <line x1={X(v)} y1={AY - 16} x2={X(v)} y2={AY + 16} stroke="currentColor" strokeWidth={8} />
          <text x={X(v)} y={AY + 100} textAnchor="middle" className="font-mono font-semibold" fill="currentColor" fillOpacity={0.7} fontSize={80}>
            {v}%
          </text>
        </g>
      ))}
      <rect x={X(lo)} y={AY - 40} width={X(hi) - X(lo)} height={80} fill="url(#ml-hatch)" stroke="currentColor" strokeWidth={7} />
      {prior.map((d) => (
        <circle key={d.name} cx={X(d.v)} cy={AY} r={26} fill="#fff" stroke="currentColor" strokeWidth={8} />
      ))}
      <circle cx={X(ours.v)} cy={AY} r={46} fill={GREEN} stroke="currentColor" strokeWidth={8} />
      <text x={(X(lo) + X(hi)) / 2} y={90} textAnchor="middle" className="font-body font-semibold" fill="currentColor" fontSize={104}>
        prior efforts: {Math.round(lo)}–{Math.round(hi)}%
      </text>
      <text x={X(ours.v)} y={90} textAnchor="middle" className="font-body font-bold" fill="currentColor" fontSize={104}>
        ours: {ours.v}%
      </text>
    </svg>
  )
}

function PriorCard() {
  return (
    <div className="absolute flex flex-col" style={{ left: 120, right: 120, top: 90, gap: 28 }}>
      <Kicker style={{ ...KICK_SENTENCE, fontSize: 120, color: INKV, marginBottom: 55 }}>Multi-label images: ours vs. prior efforts</Kicker>
      <PriorMlBars />
    </div>
  )
}

/* ---------- #08 What reannotation fixes (paper Fig. 1, ReGT halves) ---------- */
const EXAMPLES: { src: string; orig?: string; ar?: number; tag: string; ok: boolean; imgt: string; regt: string }[] = [
  {
    src: 'ex-desk.jpg',
    tag: 'incomplete',
    ok: true,
    imgt: 'computer mouse',
    regt: '+ 7 more, each boxed',
  },
  {
    src: 'ex-barbershop.jpg',
    orig: 'ex-barbershop-orig.jpg',
    ar: 1500 / 1125,
    tag: 'incomplete',
    ok: true,
    imgt: 'barbershop',
    regt: '+ 5 more,\nthe TV is a mirror reflection',
  },
  { src: 'ex-pier.jpg', orig: 'ex-pier-orig.jpg', ar: 1125 / 1500, tag: 'wrong', ok: false, imgt: 'pier', regt: 'suspension bridge, cliff' },
  {
    src: 'ex-viper.jpg',
    tag: 'fine-grained',
    ok: false,
    imgt: 'Saharan horned viper',
    regt: 'sidewinder – confirmed by tracing the photo to a Utah wildlife biologist',
  },
]

function ExampleCell({ e, h }: { e: (typeof EXAMPLES)[number]; h: number }) {
  return (
    <div className="flex min-w-0 flex-col" style={{ gap: 40 }}>
      <img src={asset(e.src)} alt={e.regt} className="block shrink-0 self-start" style={{ height: h, width: 'auto', outline: `10px solid ${INKV}`, outlineOffset: -10 }} />
      <div className="flex min-w-0 flex-col" style={{ gap: 28 }}>
        <span className="self-start font-mono font-semibold text-white" style={{ background: e.ok ? '#7d9a58' : RED, padding: '8px 26px 4px', fontSize: 50 }}>
          {e.tag}
        </span>
        <div className="flex items-baseline" style={{ gap: 26 }}>
          <GtChip k="ImGT" />
          <span className="font-body font-bold text-ink" style={{ fontSize: 62, lineHeight: 1.15 }}>
            <span style={{ textDecoration: e.ok ? 'none' : `line-through ${RED} 9px` }}>{e.imgt}</span> <span style={{ color: e.ok ? GREEN : RED }}>{e.ok ? '✓' : '✗'}</span>
          </span>
        </div>
        <div className="flex items-baseline" style={{ gap: 26 }}>
          <GtChip k="ReGT" />
          <span className="font-body font-bold text-ink" style={{ fontSize: 58, lineHeight: 1.2 }}>
            {e.regt}
          </span>
        </div>
      </div>
    </div>
  )
}

/* teaser (as in the paper's Fig. 1): original image -> arrow -> the same image with our labels and boxes */
function TeaserArrow() {
  return (
    <svg width={220} height={120} viewBox="0 0 220 120" className="shrink-0" style={{ color: INKV, marginTop: 490 }}>
      <line x1={10} y1={60} x2={160} y2={60} stroke="currentColor" strokeWidth={22} strokeLinecap="round" />
      <polygon points="140,10 215,60 140,110" fill="currentColor" />
    </svg>
  )
}

/* one image of the teaser with its label line underneath: side='im' = original + ImGT, side='re' = annotated + ReGT */
function TeaserCol({ e, h, side }: { e: (typeof EXAMPLES)[number]; h: number; side: 'im' | 're' }) {
  const w = h * (e.ar ?? 1)
  return (
    <div className="flex min-w-0 flex-col" style={{ width: w, gap: 28 }}>
      <img src={asset(side === 'im' ? (e.orig ?? e.src) : e.src)} alt="" className="block shrink-0" style={{ height: h, width: w }} />
      <div className="flex flex-col items-start" style={{ gap: 14 }}>
        <GtChip k={side === 'im' ? 'ImGT' : 'ReGT'} plain size={80} />
        {side === 'im' ? (
          <span className="font-body font-semibold text-ink" style={{ fontSize: 120, lineHeight: 1.12 }}>
            <span style={{ textDecoration: e.ok ? 'none' : `line-through ${RED} 9px` }}>{e.imgt}</span> <span style={{ color: e.ok ? GREEN : RED }}>{e.ok ? '✓' : '✗'}</span>
          </span>
        ) : (
          <span className="font-body font-semibold text-ink" style={{ fontSize: 120, lineHeight: 1.12 }}>
            {e.regt.split('\n').map((l, i) => (
              <Fragment key={i}>
                {i > 0 && <br />}
                {l}
              </Fragment>
            ))}
          </span>
        )}
      </div>
    </div>
  )
}

function ExamplesCard() {
  const H = 1100
  const [pier, bar] = [EXAMPLES[2], EXAMPLES[1]]
  return (
    <div className="absolute flex items-start justify-between" style={{ left: 110, right: 110, top: 270, bottom: 90 }}>
      <div className="flex items-start" style={{ gap: 50 }}>
        <TeaserCol e={pier} h={H} side="im" />
        <TeaserCol e={bar} h={H} side="im" />
      </div>
      <TeaserArrow />
      <div className="flex items-start" style={{ gap: 50 }}>
        <TeaserCol e={pier} h={H} side="re" />
        <TeaserCol e={bar} h={H} side="re" />
      </div>
    </div>
  )
}

/* ---------- #14 Annotation is iterative ---------- */
/* one small-object example: photo + zoomed crop, big, with the ImGT and ReGT labels beside it (as on #09) */
function ZoomRow({ full, crop, imgt, regt, imgGap = 24 }: { full: string; crop: string; imgt: string; regt: string; imgGap?: number }) {
  const H = 760
  return (
    <div className="flex items-center" style={{ gap: 130 }}>
      <div className="flex shrink-0" style={{ gap: imgGap }}>
        <img src={asset(full)} alt="" className="block" style={{ height: H, width: 'auto' }} />
        <img src={asset(crop)} alt="" className="block" style={{ height: H, width: 'auto' }} />
      </div>
      {/* labels as on card 1: plain chip above its text */}
      <div className="flex flex-col" style={{ gap: 40, whiteSpace: 'nowrap' }}>
        {(
          [
            ['ImGT', imgt],
            ['ReGT', regt],
          ] as ['ImGT' | 'ReGT', string][]
        ).map(([k, t]) => (
          <div key={k} className="flex flex-col items-start" style={{ gap: 14 }}>
            <GtChip k={k} plain size={80} />
            <span className="font-body font-semibold text-ink" style={{ fontSize: 120, lineHeight: 1.12 }}>
              {t}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function IterativeCard() {
  return (
    <div className="absolute flex flex-col" style={{ left: 120, right: 120, top: 120, gap: 56 }}>
      {/* one statement instead of heading + paragraph; kept left of the #11 chip (top right) */}
      <Prose style={{ fontSize: 114, lineHeight: 1.12, marginBottom: 40 }}>
        {/* float: only the first line has to stay clear of the #11 chip, the second may run full width */}
        <span style={{ float: 'right', width: 380, height: 120 }} />
        Tiny objects, visible only after zooming in, made labels depend on how hard each annotator looked, so we set a rule:{' '}
        <span
          className="font-bold"
          style={{
            background: 'linear-gradient(transparent 58%, rgba(244,216,90,0.65) 58%)',
            padding: '0 8px',
          }}
        >
          box what you notice at first glance (~5&nbsp;s).
        </span>
      </Prose>
      {/* rows nudged right so the weight is not all at the left border */}
      <div className="flex flex-col" style={{ gap: 56, paddingLeft: 130 }}>
        <ZoomRow full="zoom-balloon.jpg" crop="zoom-balloon-crop.jpg" imgt="balloon" regt="balloon, minivan, car wheel" />
        <ZoomRow full="zoom-fountain.jpg" crop="zoom-fountain-crop.jpg" imgt="fountain" regt="fountain, T-shirt, sock" imgGap={187} /* widths at 760 px high: 1945 (balloon row) vs 1782, so the right edges and the text line up */ />
      </div>
    </div>
  )
}

/* ---------- MLLM vs. trained annotators (split off the iterative card) ---------- */
function MllmCard() {
  return (
    <div className="absolute flex flex-col" style={{ left: 120, right: 120, top: 60, gap: 56 }}>
      <div className="font-body font-semibold text-ink" style={{ fontSize: 120, lineHeight: 1.12, marginRight: 380 }}>
        Where a frontier MLLM disagreed with us
      </div>
      <div className="flex flex-col" style={{ border: `10px solid ${INKV}`, marginTop: 40 }}>
        {(
          [
            [RED, '#fff', 'the model was right: annotators went with its label or merged it'],
            [GREEN, '#fff', 'the annotators were right'],
          ] as [string, string, string][]
        ).map(([bg, fg, t], i) => (
          <div
            key={i}
            className="flex flex-1 items-center"
            style={{
              background: bg,
              color: fg,
              padding: '30px 44px',
              gap: 60,
              borderTop: i ? `10px solid ${INKV}` : undefined,
            }}
          >
            <div className="shrink-0 font-display italic" style={{ fontSize: 190, lineHeight: 0.9 }}>
              ≈50%
            </div>
            <div className="font-body font-semibold" style={{ fontSize: 100, lineHeight: 1.15 }}>
              {t}
            </div>
          </div>
        ))}
      </div>
      <Prose style={{ fontSize: 120, lineHeight: 1.12, marginTop: 20 }}>
        {/* the take-away of this card: bold with a marker-style underline, not a full block */}
        <span
          className="font-bold"
          style={{
            background: 'linear-gradient(transparent 58%, rgba(244,216,90,0.65) 58%)',
            padding: '0 8px',
          }}
        >
          Neither alone is reliable.
        </span>{' '}
        So every image got a second, verification pass under the final guidelines, with anonymized MLLM proposals as an optional reference.
      </Prose>
    </div>
  )
}

/* ---------- #15 Take-aways & limitations ---------- */
const TAKEAWAYS: [string, string][] = [
  ['Stop building benchmarks in one shot.', 'Errors and definitional issues surface only while annotating.'],
  ['Pair trained annotators with anonymized MLLM predictions.', 'With dedicated tools and a lead annotator bridging research and labeling, this is the quality ceiling at scale today.'],
  ['Anchor fine-grained classes in curated resources.', 'iNaturalist, eBird and expert databases beat generic crowdsourcing.'],
  ['MLLM benchmarks repeat ImageNet’s mistakes,', 'crowdsourced the same way or labeled by the very models they evaluate.'],
]

function TakeawayCard() {
  return (
    <div className="absolute flex flex-col" style={{ left: 120, right: 120, top: 110, gap: 80 }}>
      {TAKEAWAYS.map(([h], i) => (
        <div key={h} className="flex items-start" style={{ gap: 46, marginRight: i === 0 ? 380 : 0 }}>
          <div
            className="shrink-0 bg-white text-center font-mono font-bold text-ink"
            style={{
              ...ON_WHITE,
              width: PIPE.indent - 46, // same size as the step chips of card 6
              border: '10px solid #141414',
              padding: '10px 0 8px',
              fontSize: 96,
              lineHeight: 1.15,
            }}
          >
            {i + 1}
          </div>
          <Prose style={{ fontSize: 140 }}>
            {h}
          </Prose>
        </div>
      ))}
    </div>
  )
}

function Panel({ id, children }: { id: PanelId; children?: ReactNode }) {
  const [x, y, w, h] = R[id]
  const m = META[id]
  const color = GROUP[m.group].color
  const variant = m.variant ?? 'gray'
  const nn = m.seed ?? (typeof m.n === 'number' ? m.n : 5)
  const t = tiltFor(nn)
  const rz = ROT[id] ?? t.rz
  const sc = SCALE[id] ?? 1
  return (
    <section
      className="absolute"
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        background: cardBg(m.group, variant),
        // dark cards: an ink border would vanish into the card, so they use their role colour (as the label tag and corner handles do)
        border: `${BORDER}px solid ${BG_MODE === 'gray' || variant === 'dark' ? color : INK}`,
        boxSizing: 'border-box',
        boxShadow: BG_MODE === 'gray' ? '0 0 0 12px #141414, 26px 26px 0 12px #141414' : '26px 26px 0 #141414',
        transform: `rotate(${rz}deg) skew(${t.skx}deg, ${t.sky}deg)`,
      }}
      data-panel={m.n}
    >
      <Label group={m.group} wrapW={m.wrap ? w : undefined}>
        {m.title}
      </Label>
      {m.n !== undefined && <Index n={m.n} />}
      {m.contrib && (
        // which contribution (card #02) this block delivers
        <div
          className="absolute z-20 bg-white font-mono font-bold text-ink"
          style={{
            top: 92,
            right: 420,
            border: '10px solid #141414',
            padding: '12px 32px 10px',
            fontSize: 62,
            lineHeight: 1.15,
          }}
        >
          {m.contrib}
        </div>
      )}
      <Corner color={color} x="r" y="t" />
      <Corner color={color} x="l" y="b" />
      <Corner color={color} x="r" y="b" />
      {children ? (
        // dark cards: everything drawn in theme ink turns light (white chips reset it)
        <div
          className={sc === 1 ? 'contents' : 'absolute'}
          style={{
            ...(sc === 1 ? {} : { left: 0, top: 0, width: w / sc, height: h / sc, transform: `scale(${sc})`, transformOrigin: '0 0' }),
            ...(variant === 'dark' ? ({ '--color-ink': '#f4efe6' } as CSSProperties) : {}),
          }}
        >
          {children}
        </div>
      ) : (
        m.hint && <Slot light={variant === 'dark' && BG_MODE !== 'gray'}>{m.hint}</Slot>
      )}
    </section>
  )
}

/* ---------- Title card: annotated object ---------- */
const BOX_W = 7300 // wider than the text block on purpose: the text is sized from CONTENT_W, so the rest is margin
const BOX_H = 5000
const BOX = { l: 60, r: 60, t: 190, b: 230 }
const TITLE_ROT = -1.2
const LOGO_H = 520 // credential logos, bottom right corner of the poster
const LOGO_GAP = 200 // gap between the logos
const LOGO_INSET = 200 // distance from the poster's right / bottom edge

function Handle({ style }: { style: CSSProperties }) {
  return (
    <div
      className="absolute"
      style={{
        width: 140,
        height: 140,
        marginLeft: -70,
        marginTop: -70,
        background: '#fff',
        border: `36px solid ${RED}`,
        boxSizing: 'border-box',
        ...style,
      }}
    />
  )
}

function AttrChip({ label, checked = true }: { label: string; checked?: boolean }) {
  return (
    <div
      className="flex items-center whitespace-nowrap bg-white font-mono font-semibold text-ink"
      style={{
        border: '20px solid #141414',
        padding: '18px 60px 18px 40px',
        fontSize: 96,
        gap: 40,
      }}
    >
      <span
        className="inline-flex items-center justify-center"
        style={{
          width: 90,
          height: 90,
          border: '16px solid #141414',
          background: checked ? RED : '#fff',
          color: '#fff',
          fontSize: 80,
          lineHeight: 1,
        }}
      >
        {checked ? '✓' : ''}
      </span>
      {label}
    </div>
  )
}

/* Text that scales itself so its natural width equals `target` px (capped by `max`).
   Measures the real loaded font, so it fills the card whichever font is in use. */
function FitLine({ children, target, max, className, style }: { children: ReactNode; target: number; max: number; className?: string; style?: CSSProperties }) {
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
      <span
        ref={probe}
        aria-hidden
        style={{
          position: 'absolute',
          visibility: 'hidden',
          fontSize: 400,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        {children}
      </span>
      {children}
    </div>
  )
}

const CONTENT_W = 6700 - 60 - 60 - 172 // text-block width the FitLine targets are measured against (independent of BOX_W)

function TitleBlock() {
  const boxW = BOX_W - BOX.l - BOX.r
  const boxH = BOX_H - BOX.t - BOX.b
  const hx = [0, boxW / 2, boxW]
  const hy = [0, boxH / 2, boxH]
  return (
    <section
      className="absolute"
      style={{
        left: TITLE.x - BOX_W / 2,
        top: TITLE.y - BOX_H / 2,
        width: BOX_W,
        height: BOX_H,
        zIndex: 28,
        transform: `rotate(${TITLE_ROT}deg) scale(${TITLE_SCALE})`,
      }}
    >
      <div
        className="absolute"
        style={{
          left: BOX.l + 50,
          right: BOX.r + 50,
          top: BOX.t + 50,
          bottom: BOX.b + 50,
          background: '#f4efe6',
          border: '36px solid #141414',
          boxShadow: '30px 30px 0 #141414',
        }}
      />
      <div
        className="absolute"
        style={{
          left: BOX.l,
          top: BOX.t,
          width: boxW,
          height: boxH,
          border: `40px solid ${RED}`,
          boxSizing: 'border-box',
        }}
      >
        {hx.flatMap((x, i) => hy.map((y, j) => (i === 1 && j === 1 ? null : <Handle key={`${i}${j}`} style={{ left: x, top: y }} />)))}
      </div>
      <div
        className="absolute whitespace-nowrap font-mono font-semibold text-white"
        style={{
          left: BOX.l - 12,
          top: 20,
          background: RED,
          padding: '30px 90px 24px 70px',
          fontSize: 110,
          letterSpacing: 4,
        }}
      >
        ReGT: ReImageNet
      </div>
      <div className="absolute flex" style={{ left: BOX.l, bottom: 20, gap: 60 }}>
        <AttrChip label="multilabel" />
        <AttrChip label="boxes" />
        <AttrChip label="revised classes" />
        <AttrChip label="attributes" />
      </div>

      <div className="absolute flex flex-col items-center justify-center text-center" style={{ left: BOX.l + 86, right: BOX.r + 86, top: BOX.t + 86, bottom: BOX.b + 86 }}>
        <FitLine
          target={CONTENT_W - 795}
          max={800}
          className="font-display text-ink"
          style={{
            lineHeight: 0.95,
            transform: 'skewX(-8deg)',
            marginTop: 30,
            letterSpacing: '0.01em',
          }}
        >
          DOOMED TO RE-ANNOTATE,
        </FitLine>
        <FitLine
          target={CONTENT_W - 1840}
          max={1100}
          className="font-display"
          style={{
            color: RED,
            lineHeight: 0.92,
            transform: 'skewX(-8deg) rotate(-1.5deg)',
            letterSpacing: '0.01em',
          }}
        >
          FOREVER!
        </FitLine>
        <div
          className="bg-ink font-display italic text-comic-yellow"
          style={{
            padding: '30px 140px 10px',
            marginTop: 40,
            transform: 'skewX(-6deg) rotate(-1deg)',
          }}
        >
          <FitLine target={CONTENT_W - 985} max={560} style={{ lineHeight: 1, letterSpacing: '0.015em' }}>
            The ImageNet Story
          </FitLine>
        </div>
        {/* TL;DR sticker (the old yellow "Key numbers" card), stuck on the title card so it is the first thing read at the poster */}
        <div
          className="relative flex flex-col items-center"
          style={{
            background: '#f4d85a',
            border: '20px solid #141414',
            boxShadow: '26px 26px 0 #141414',
            padding: '90px 50px 60px',
            marginTop: 180,
            transform: 'rotate(-0.8deg)',
          }}
        >
          <div
            className="absolute font-mono font-bold text-white"
            style={{
              left: -20,
              top: -20,
              transform: 'translateY(-100%)',
              background: RED,
              padding: '14px 50px 10px',
              fontSize: 84,
              letterSpacing: 6,
            }}
          >
            TL;DR
          </div>
          <FitLine target={CONTENT_W - 795} max={200} className="font-body font-semibold text-ink" style={{ lineHeight: 1.2 }}>
            We reannotated the whole ImageNet-1k validation set:
          </FitLine>
          <div className="flex items-stretch" style={{ width: CONTENT_W - 600, marginTop: 45 }}>
            {(
              [
                ['≈12%', ['of the original ImageNet-1k', 'labels are incorrect']],
                ['31.9%', ['of images are multilabel']],
                ['4.0%', ['of images contain no object', 'from an ImageNet-1k class']],
              ] as [string, string[]][]
            ).map(([num, lines], i) => (
              <div
                key={num}
                className="flex flex-1 flex-col items-center justify-center"
                style={{
                  borderLeft: i ? '10px dashed rgba(20,20,20,0.25)' : undefined,
                  padding: '0 40px',
                }}
              >
                <div className="font-display italic" style={{ fontSize: 400, lineHeight: 1, letterSpacing: '0.01em', color: INK }}>
                  {num}
                </div>
                <div className="font-body font-semibold text-ink" style={{ fontSize: 80, lineHeight: 1.15, whiteSpace: 'nowrap', marginTop: 10 }}>
                  {lines.map((l) => (
                    <div key={l}>{l}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <FitLine target={CONTENT_W - 750} max={142} className="font-mono font-semibold text-ink" style={{ marginTop: 185, lineHeight: 1.3 }}>
          Illia Volkov · Nikita Kisel · Tetiana Mishkina · Klara Janouskova · Jiri Matas
        </FitLine>
        <FitLine target={CONTENT_W - 985} max={106} className="font-mono text-ink/80" style={{ marginTop: 38, lineHeight: 1.3 }}>
          Visual Recognition Group · Czech Technical University in Prague
        </FitLine>
      </div>
    </section>
  )
}

/* ---------- Rubber stamps: the endless revision loop, laid under the panels ----------
   12 faint stamps REV 01..12 (one loop of re-annotation -> the ~12% wrong labels),
   plus a few notes from the paper's pipeline. Most hide under cards and peek from seams.
   Hidden by default; show with ?stamps=1. */
const STAMPS_ON = new URLSearchParams(window.location.search).get('stamps') === '1'
type StampDef = { x: number; y: number; r: number; t: string; red?: boolean; loop?: boolean }
const SPECIAL_STAMPS: StampDef[] = [
  { x: 6050, y: 2500, r: -14, t: 'not sure ?', red: true },
  { x: 4750, y: 4400, r: 9, t: 'edge case', red: true },
  { x: 12350, y: 4350, r: -7, t: 'guidelines v12' },
  { x: 16000, y: 2350, r: 6, t: '', loop: true },
  { x: 2000, y: 9500, r: -9, t: 'since 2012' },
  { x: 9350, y: 8750, r: 11, t: '12.2% wrong', red: true },
]
const STAMPS: StampDef[] = [
  ...Array.from({ length: 12 }, (_, i) => ({
    x: 2600 + 7100 * (i % 3) + Math.sin(i * 4.7) * 700,
    y: 1500 + 3130 * ((i / 3) | 0) + Math.cos(i * 3.1) * 450,
    r: (i % 2 ? 1 : -1) * (5 + (i % 3) * 2.5),
    t: `REV ${String(i + 1).padStart(2, '0')}`,
  })),
  ...SPECIAL_STAMPS,
]

/* comic print: solid ink pass over a red offset misregistration, halftone-dot fill inside */
function Stamp({ s }: { s: StampDef }) {
  const col = s.red ? RED : INK
  const alt = s.red ? INK : RED
  const dots = s.red ? 'st-dots-red' : 'st-dots'
  const body = (
    <>
      {s.loop ? (
        <>
          <path d="M 0 0 m -330 0 a 330 330 0 1 0 660 0 a 330 330 0 1 0 -660 0" fill={`url(#${dots})`} stroke="none" />
          <path d="M -28.7 328.7 A 330 330 0 1 1 28.7 328.7" fill="none" stroke="currentColor" strokeWidth={30} />
          <path d="M -29 329 L 60 258 L 60 400 Z" fill="currentColor" stroke="none" />
          <text textAnchor="middle" dominantBaseline="central" fill="currentColor" stroke="none" className="font-display" fontSize={460}>
            ∞
          </text>
        </>
      ) : (
        <>
          <rect x={-wOf(s) / 2 + 34} y={-192} width={wOf(s) - 68} height={384} rx={48} fill={`url(#${dots})`} stroke="none" />
          <rect x={-wOf(s) / 2} y={-240} width={wOf(s)} height={480} rx={80} fill="none" stroke="currentColor" strokeWidth={28} />
          <rect x={-wOf(s) / 2 + 52} y={-196} width={wOf(s) - 104} height={392} rx={46} fill="none" stroke="currentColor" strokeWidth={8} />
          <text textAnchor="middle" dominantBaseline="central" fill="currentColor" stroke="none" className="font-mono" fontWeight={700} fontSize={190} letterSpacing={16}>
            {s.t}
          </text>
        </>
      )}
    </>
  )
  return (
    <g transform={`translate(${s.x},${s.y}) rotate(${s.r})`} opacity={s.red ? 0.2 : 0.18}>
      <g transform="translate(22,16) rotate(1.1)" color={alt} opacity={0.45}>
        {body}
      </g>
      <g color={col}>{body}</g>
    </g>
  )
}

const wOf = (s: StampDef) => 300 + s.t.length * 0.64 * 190

function Stamps() {
  if (!STAMPS_ON) return null
  return (
    <svg className="absolute inset-0" width={W} height={H} style={{ pointerEvents: 'none' }}>
      <defs>
        <pattern id="st-dots" width="52" height="46" patternUnits="userSpaceOnUse">
          <circle cx="13" cy="12" r="9.5" fill={INK} />
          <circle cx="39" cy="35" r="9.5" fill={INK} />
        </pattern>
        <pattern id="st-dots-red" width="52" height="46" patternUnits="userSpaceOnUse">
          <circle cx="13" cy="12" r="9.5" fill={RED} />
          <circle cx="39" cy="35" r="9.5" fill={RED} />
        </pattern>
      </defs>
      {STAMPS.map((s, i) => (
        <Stamp key={i} s={s} />
      ))}
    </svg>
  )
}

/* ---------- Yarn: from the title card to every panel, laid UNDER the panels (visible only in the gaps) ---------- */
type Pt = { x: number; y: number }

function rotAround(p: Pt, c: Pt, deg: number): Pt {
  const th = (deg * Math.PI) / 180
  const dx = p.x - c.x
  const dy = p.y - c.y
  return {
    x: c.x + dx * Math.cos(th) - dy * Math.sin(th),
    y: c.y + dx * Math.sin(th) + dy * Math.cos(th),
  }
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
  let u = c.x + dx * t
  let v = c.y + dy * t
  // the label tag sits on the top edge (119px mono + 4px letter spacing, 173px side padding): if the node would land under it,
  // slide it along the border to just past the label; if the label leaves no room (narrow card), put it on the side edge facing the title instead
  if (Math.abs(v - y) < 1) {
    const m = META[id]
    const chars = `${GROUP[m.group].name} · ${m.title}`.length
    const labelW = chars * (119 * 0.6 + 4) + 173 + BORDER
    if (u < x + labelW + 90) {
      if (x + labelW + 140 <= x + w - 450) u = x + labelW + 140
      else {
        u = x + w // right edge: the only narrow card (11) has its neighbour on the left, 110 px away
        v = y + Math.min(h / 2, 520)
      }
    }
  }
  return rotAround({ x: u, y: v }, c, rot)
}

/* hand-routed hops between consecutive cards (poster px): both ends sit a little inside the card borders, clear of the name tags and
   number chips; hops 2 -> 3 and 3 -> 4 pass under the title card. Every hop is a smooth curve through its points. */
const STORY: Pt[][] = [
  [{ x: 4300, y: 2370 }, { x: 4300, y: 2790 }], // 1 -> 2
  [{ x: 5870, y: 4200 }, { x: 9938, y: 4300 }, { x: 14060, y: 4100 }], // 2 -> 3 (behind the title)
  [{ x: 17700, y: 5335 }, { x: 15000, y: 5440 }, { x: 12000, y: 5528 }, { x: 8000, y: 5538 }, { x: 6250, y: 5580 }, { x: 5890, y: 5950 }], // 3 -> 4 (along the gap under the title)
  [{ x: 4300, y: 9350 }, { x: 4300, y: 9660 }], // 4 -> 5
  [{ x: 5960, y: 10300 }, { x: 6050, y: 8900 }, { x: 6060, y: 7150 }, { x: 6205, y: 6450 }], // 5 -> 6 (up the gap between the left and middle columns)
  [{ x: 9000, y: 6950 }, { x: 9000, y: 7290 }], // 6 -> 7
  [{ x: 10300, y: 7800 }, { x: 10410, y: 7650 }, { x: 10520, y: 7450 }], // 7 -> 8
  [{ x: 13650, y: 8670 }, { x: 13650, y: 9060 }], // 8 -> 9
  [{ x: 14700, y: 9500 }, { x: 14780, y: 9400 }, { x: 14880, y: 9300 }], // 9 -> 10 (Labels & boxes)
  [{ x: 16960, y: 8235 }, { x: 16960, y: 7885 }], // 10 -> 11
  [{ x: 19590, y: 7880 }, { x: 19775, y: 8250 }, { x: 19655, y: 8750 }], // 11 -> 12 (down the right side)
  [{ x: 18400, y: 10000 }, { x: 18400, y: 10480 }], // 12 -> 13
]

function storyPath(pts: Pt[]): string {
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(i + 2, pts.length - 1)]
    d += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6} ${p2.x} ${p2.y}`
  }
  return d
}

/* the story, card by card: title -> 1 -> 2 -> ... -> 13. Each hop takes its target card's role colour; same look as the old
   title yarns (ink cord + coloured dashes, square handle at each end). Drawn under the panels, handles on top. */
const STORY_ORDER: PanelId[] = ['M2', 'M6', 'C', 'A2', 'M1', 'M5', 'M3', 'M8', 'M7', 'B', 'M9', 'M11', 'M10']
const HOPS: { d: string; color: string; ends: Pt[] }[] = [
  // title -> card 1 (the story starts at the title)
  (() => {
    const e = edgeNode(STORY_ORDER[0])
    return { d: `M ${TITLE.x} ${TITLE.y} L ${e.x} ${e.y}`, color: GROUP[META[STORY_ORDER[0]].group].color, ends: [e] }
  })(),
  ...STORY.map((pts, i) => ({
    d: storyPath(pts),
    color: GROUP[META[STORY_ORDER[i + 1]].group].color,
    ends: [pts[0], pts[pts.length - 1]],
  })),
]

/* below the panels */
function Links() {
  return (
    <svg className="absolute inset-0" width={W} height={H} style={{ pointerEvents: 'none' }}>
      {HOPS.map((l, i) => (
        <g key={i} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d={l.d} stroke={INK} strokeWidth={34} />
          <path d={l.d} stroke={l.color} strokeWidth={20} strokeDasharray="70 40" />
        </g>
      ))}
    </svg>
  )
}

/* square handle where each thread meets its panel border (straddles the edge, barely touches content) */
function Nodes() {
  return (
    <svg className="absolute inset-0" width={W} height={H} style={{ pointerEvents: 'none', zIndex: 30 }}>
      {HOPS.flatMap((l, i) => l.ends.map((q, j) => <rect key={`${i}-${j}`} x={q.x - 52} y={q.y - 52} width={104} height={104} fill="#fff" stroke={l.color} strokeWidth={26} />))}
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
          backgroundImage: 'linear-gradient(rgba(20,20,20,0.12) 3px, transparent 3px), linear-gradient(90deg, rgba(20,20,20,0.12) 3px, transparent 3px), linear-gradient(rgba(20,20,20,0.06) 3px, transparent 3px), linear-gradient(90deg, rgba(20,20,20,0.06) 3px, transparent 3px)',
          backgroundSize: '1000px 1000px, 1000px 1000px, 200px 200px, 200px 200px',
        }}
      />

      {/* comic paper: staggered Ben-Day dots */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(rgba(20,20,20,0.12) 17px, transparent 19px), radial-gradient(rgba(20,20,20,0.12) 17px, transparent 19px)',
          backgroundSize: '130px 130px, 130px 130px',
          backgroundPosition: '0 0, 65px 65px',
        }}
      />

      {/* soft attribute-colour glows in the corners (the paper's five attribute colours) */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            'radial-gradient(26% 44% at 0% 0%, rgba(247,118,61,0.16), transparent 100%)', // rendition
            'radial-gradient(26% 44% at 100% 0%, rgba(135,70,174,0.14), transparent 100%)', // crowd
            'radial-gradient(26% 44% at 0% 100%, rgba(61,191,184,0.14), transparent 100%)', // reflection
            'radial-gradient(26% 44% at 100% 100%, rgba(184,64,65,0.14), transparent 100%)', // dominant
            'radial-gradient(22% 30% at 50% 100%, rgba(154,154,154,0.12), transparent 100%)', // text-recognition
          ].join(', '),
        }}
      />

      <Stamps />

      <Links />

      {/* top band, left: context story (the opener) + task */}
      <Panel id="B">
        <DistBars />
      </Panel>
      <Panel id="C">
        <GtDefs />
        <SplitsTree />
      </Panel>

      {/* top band, right: link / QR, attribute legend, key numbers */}
      <Panel id="QR">
        <LinkCard />
      </Panel>
      {/* scattered pile: method + results, in reading order */}
      <Panel id="M1">
        <PipelineCard />
      </Panel>
      <Panel id="A2">
        <div className="absolute flex flex-col justify-between" style={{ left: 130, right: 130, top: 270, bottom: 100 }}>
          <div className="flex flex-col" style={{ gap: 40 }}>
          <div className="flex" style={{ gap: 50 }}>
            <AttrCell name="rendition" color={ATTR.rendition} src="attr-rendition-piano.jpg" stat={2} text="Toy, drawing or other stylized depiction" />
            <AttrCell name="crowd" color={ATTR.crowd} src="attr-crowd-flamingo.jpg" pos="center bottom" stat={0} text="5+ instances of one class, collapsed into a single box" />
            <AttrCell name="text-recognition" color={ATTR.text} src="attr-text-theater.jpg" stat={3} text="Class is only recognizable by reading the text" />
            <AttrCell name="reflection" color={ATTR.reflection} src="attr-reflection-mau.jpg" stat={1} text="Object seen in a mirror or water surface" />
          </div>
          <Prose style={{ fontSize: 104 }}>
            Tiles: accuracy change per attribute w.r.t. S images
          </Prose>
          <Prose style={{ fontSize: 104 }}>Text: language-aligned models read it (MLLMs +12 pp), supervised ones mostly cannot.<br />Renditions hurt every family, supervised models most.</Prose>
          </div>
          <div className="flex" style={{ gap: 70 }}>
            <div className="flex min-w-0 flex-col" style={{ gap: 18, width: 'calc((100% - 70px) / 2)' }}>
              <div className="flex" style={{ gap: 20 }}>
                {[
                  ['attr-dominant-terriers.jpg', 'both dominant'],
                  ['attr-notdominant-cap.jpg', 'not dominant'],
                ].map(([src, tag]) => (
                  <div key={src} className="flex min-w-0 flex-1 flex-col items-center" style={{ gap: 10 }}>
                    <div className="w-full" style={{ aspectRatio: '4 / 3', overflow: 'hidden' }}>
                      <img src={asset(src)} alt="" className="block h-full w-full" style={{ objectFit: 'cover' }} />
                    </div>
                    <div className="whitespace-nowrap font-mono font-semibold text-ink" style={{ fontSize: 120 }}>
                      {tag}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex min-w-0 flex-1 items-center">
              <AttrNote name="dominant" color={ATTR.dominant} text="Noticed immediately: a judgment, not a matter of size" />
            </div>
          </div>
        </div>
      </Panel>
      {/* scattered pile: method + results, in reading order */}
      <Panel id="M2">
        <ExamplesCard />
      </Panel>
      <Panel id="M3">
        <AccuracyCard />
      </Panel>
      <Panel id="M5">
        <TasksCard />
      </Panel>
      <Panel id="M8">
        <CropsCard />
      </Panel>
      <Panel id="M6">
        <ClassesCard />
        {/* card 14 (prior reannotations' multilabel ratio) merged in below the labeling rules */}
        <div className="absolute" style={{ left: 0, right: 0, top: 1200, borderTop: '10px dashed rgba(20,20,20,0.3)' }}>
          <PriorCard />
        </div>
      </Panel>
      <Panel id="M7">
        <DerivedCard />
      </Panel>
      <Panel id="M9">
        <IterativeCard />
      </Panel>
      <Panel id="M11">
        <MllmCard />
      </Panel>
      <Panel id="M10">
        <TakeawayCard />
      </Panel>

      <TitleBlock />
      <Nodes />

      {/* credentials, poster's bottom right corner: VRG, CTU, NeurIPS */}
      <div className="absolute flex items-center" style={{ right: LOGO_INSET, bottom: LOGO_INSET, height: LOGO_H, gap: LOGO_GAP, zIndex: 40 }}>
        <img src={asset('logo-vrg-full.png')} alt="Visual Recognition Group" style={{ height: LOGO_H, width: 'auto' }} />
        <img src={asset('logo-ctu.svg')} alt="Czech Technical University in Prague" style={{ height: LOGO_H, width: 'auto' }} />
        <img src={asset('logo-neurips.png')} alt="NeurIPS" style={{ height: LOGO_H, width: 'auto' }} />
      </div>

      {/* thin board edge */}
      <div
        className="absolute inset-0"
        style={{
          zIndex: 60,
          pointerEvents: 'none',
          boxSizing: 'border-box',
          border: `40px solid ${INK}`,
        }}
      />
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
