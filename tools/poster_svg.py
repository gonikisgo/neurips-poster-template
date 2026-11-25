#!/usr/bin/env python3
# Generates poster.svg: a 1:1 vector export of the React poster (src/App.tsx, v2 "annotation workspace").
# Text stays <text>, cards stay shapes, photos stay rasters.
import base64, math, os, re, struct, sys
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'public', 'assets')
FONTS = os.path.join(ROOT, '.tools', 'fonts')
OUT = os.path.join(ROOT, 'poster.svg')

# ---------------- geometry (mirrors App.tsx, classic bg mode) ----------------
W, H = 19876, 12600
BORDER = 18
TITLE = (W / 2, 2620)
INK, RED = '#141414', '#e0412f'

R = {
    'A': [320, 320, 3084, 720], 'D': [320, 1300, 3084, 720], 'C': [320, 2280, 3084, 1940],
    'A2': [3664, 320, 2616, 3900], 'QR': [13600, 320, 5956, 2000], 'B': [13600, 2580, 2200, 1640],
    'B2': [16060, 2580, 3496, 1640],
    'M1': [380, 4560, 4400, 3900], 'M2': [4900, 5100, 3300, 2900], 'M3': [8500, 5100, 3900, 4100],
    'M4': [12500, 5100, 3400, 2800], 'M5': [16100, 4620, 3400, 4200], 'M6': [380, 8750, 3500, 3530],
    'M7': [4000, 8450, 3600, 3830], 'M8': [7750, 9350, 4300, 2930], 'M9': [12550, 7950, 3500, 4330],
    'M10': [16150, 9150, 3400, 3130],
}
ROT = {'M1': -2.5, 'PANEL_ORDER': None, 'M2': 3, 'M3': -2, 'M4': 3.5, 'M5': -2.5,
       'M6': 2, 'M7': -3, 'M8': 2, 'M9': -2.5, 'M10': 3}
ROT.pop('PANEL_ORDER')
GROUP = {'context': ('Context', '#2f6fe0'), 'method': ('Method', '#2aa876'), 'results': ('Results', '#f08a24'),
         'takeaway': ('Takeaway', '#8a4fd8'), 'link': ('Data', '#14a3b8')}
META = {
    'A': (1, 'Problem', 'context', 'ImageNet-1k validation labels: single-label, noisy, from 2012', None),
    'B': (5, 'Prior reannotations', 'context', 'ReaL · Multilabel · ImageNetMultiLabel · Label Errors', None),
    'C': (3, 'Image splits', 'method', None, 'flat'),
    'D': (2, 'Contributions', 'context', 'ReImageNet · evaluation · derived benchmarks · guidance', None),
    'QR': ('LINK', 'Dataset and annotation tool', 'link', None, 'white'),
    'A2': (4, 'Attributes', 'method', None, 'white'),
    'B2': (6, 'Key numbers', 'results', None, 'yellow'),
    'M1': (7, 'Annotation pipeline', 'method', 'Train annotators → class groups → per-image labels → verification', None),
    'M2': (8, 'ImGT vs ReGT', 'results', 'Fig. 1: original label vs new multilabel boxes', 'dark'),
    'M3': (9, 'Label statistics', 'results', 'Fig. 4: single-label / multilabel / no-class split of 50,000 images', None),
    'M4': (10, 'Accuracy on ReGT', 'results', 'Tab. 1: MLLMs vs VLMs vs supervised models', None),
    'M5': (11, 'Attribute analysis', 'results', 'Tab. 2: crowd · reflection · rendition · text-recognition', None),
    'M6': (12, 'Object crops', 'results', 'Tab. 3: All · Largest · Any · ExCrops', None),
    'M7': (13, 'Small objects', 'method', 'Fig. 3: zoomed-in crops that need context', 'dark'),
    'M8': (14, 'Derived benchmarks', 'results', 'Tab. 4: error propagation to ImageNetV2, -A, -R, -Sketch, ObjectNet, CounterAnimal', None),
    'M9': (15, 'Limitations', 'takeaway', 'European annotators · validation set only · closed MLLMs', None),
    'M10': (16, 'Take-aways', 'takeaway', 'Annotate iteratively; human + MLLM beats either alone', None),
}
ATTR = {'rendition': '#f7763d', 'crowd': '#8746ae', 'text': '#9a9a9a', 'reflection': '#3dbfb8', 'dominant': '#b84041'}

# ---------------- fonts ----------------
FACE = {'display': (400, 'normal'), 'body': (400, 'normal'), 'mono': (400, 'normal')}
_fonts = {}
def _fname(fam, w, s='normal'):
    if fam == 'mono' and w > 600:
        w = 600  # Plex Mono has no 700 face; browsers synthesize/fall back
    return {'display': 'bangers', 'body': 'plexsans', 'mono': 'plexmono'}[fam] + '-%s-%s.ttf' % (w, s)
def font(fam, weight=400):
    key = (fam, weight)
    if key not in _fonts:
        f = TTFont(os.path.join(FONTS, _fname(fam, weight)))
        upem = f['head'].unitsPerEm
        cmap = f.getBestCmap()
        hm = f['hmtx']
        os2 = f['OS/2']
        _fonts[key] = {
            'upem': upem, 'cmap': cmap, 'hm': hm,
            'glyphw': {}, 'asc': os2.usWinAscent / upem, 'desc': os2.usWinDescent / upem,
        }
    return _fonts[key]
def gw(fi, ch):
    g = fi['cmap'].get(ord(ch))
    if g is None:
        return 0.6  # fallback-ish (monospace) width for missing glyph
    return fi['hm'][g][0] / fi['upem']
def text_w(s, size, fam, weight=400, ls=0):
    """ls in px (em given by caller). Fallback chain like CSS: display->mono-ish for missing."""
    fi = font(fam, weight)
    tot = 0.0
    for ch in s:
        g = fi['cmap'].get(ord(ch))
        tot += (fi['hm'][g][0] / fi['upem']) if g is not None else 0.6
    return tot * size + ls * max(len(s) - 0, 0)
def line_h(size, fam, weight=400):
    fi = font(fam, weight)
    return (fi['asc'] + fi['desc']) * size  # CSS line-height:normal
def fit_line(s, target, maxsize, fam, weight=400, ls_em=0):
    w_per_px = 0.0
    fi = font(fam, weight)
    for ch in s:
        g = fi['cmap'].get(ord(ch))
        w_per_px += (fi['hm'][g][0] / fi['upem']) if g is not None else 0.6
    size = target / (w_per_px + ls_em)
    return min(maxsize, size)
def wrap(s, width, size, fam, weight=400, ls=0):
    words = s.split(' ')
    lines, cur = [], ''
    for w in words:
        t = (cur + ' ' + w) if cur else w
        if cur and text_w(t, size, fam, weight, ls) > width:
            lines.append(cur); cur = w
        else:
            cur = t
    if cur: lines.append(cur)
    return lines or ['']

def base_y(top, size, lh_px, fam, weight=400):
    """baseline of a line whose box starts at top with line-height lh_px (or normal)."""
    fi = font(fam, weight)
    lh = line_h(size, fam, weight) if lh_px is None else lh_px
    return top + (lh - (fi['asc'] + fi['desc']) * size) / 2 + fi['asc'] * size

# ---------------- images ----------------
def img_dims(data):
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        w, h = struct.unpack('>II', data[16:24]); return w, h
    if data[:2] == b'\xff\xd8':
        i = 2
        while i < len(data):
            if data[i] != 0xFF: i += 1; continue
            m = data[i+1]
            if m in (0xC0,0xC1,0xC2,0xC3,0xC5,0xC6,0xC7,0xC9,0xCA,0xCB,0xCD,0xCE,0xCF):
                h, w = struct.unpack('>HH', data[i+7:i+11]); return w, h
            ln = struct.unpack('>H', data[i+2:i+4])[0]; i += 2 + ln
    raise ValueError('unknown image')
def img64(name):
    data = open(os.path.join(ASSETS, name), 'rb').read()
    mime = 'image/png' if name.endswith('.png') else 'image/jpeg'
    w, h = img_dims(data)
    return 'data:%s;base64,' % mime + base64.b64encode(data).decode(), w, h

_imcache = {}
def img_ref(name):
    if name not in _imcache:
        uri, w, h = img64(name)
        _imcache[name] = (uri, w, h)
    return _imcache[name]

_svgdefs = []   # deferred <image> defs
def use_img(name, x, y, w, h, par=None, xmid=0.5, clip=None):
    uri, iw, ih = img_ref(name)
    _svgdefs.append('<image id="img-%s" width="%g" height="%g" href="%s"/>' % (name, iw, ih, uri))
    par_v = {'x': par + ' meet'} if False else None
    s = '<image width="%g" height="%g" href="#img-%s"' % (w, h, name) if False else ''
    return ('<image x="%s" y="%s" width="%g" height="%g" href="%s" xlink:href="%s" preserveAspectRatio="%s"%s/>'
            % (x, y, w, h, uri, uri, par or 'none', ' clip-path="url(%s)"' % clip if clip else ''))

def svg_asset_inline(path, color, x, y, size):
    """inline an svg asset (qr/logo) scaled to size at x,y."""
    d = open(os.path.join(ASSETS, path)).read()
    vb = re.search(r'viewBox="([^"]+)"', d)
    vb = [float(v) for v in vb.group(1).split()] if vb else [0, 0, re.search(r'width="([\d.]+)"', d).group(1) and 800, 800]
    k = size / vb[2]
    body = d[d.index('>', d.index('<svg')) + 1:d.rindex('</svg>')]
    if color:
        body = body.replace('fill="#fff"', 'fill="%s"' % color)
    return '<g transform="translate(%g,%g) scale(%g)">\n%s\n</g>' % (x, y, k, body)

# ---------------- svg builder ----------------
lines = []
def E(s, d=0):
    lines.append('  ' * d + s)

def g_start(label, d=0):
    E('<g id="%s">' % label, d)
def g_end(d=0):
    E('</g>', d)

def rgba_split(c):
    m = re.match(r'rgba\((\d+),(\d+),(\d+),([\d.]+)\)', c or '')
    if m:
        r, g, b, a = int(m.group(1)), int(m.group(2)), int(m.group(3)), float(m.group(4))
        return '#%02x%02x%02x' % (r, g, b), a
    return c, None
def rect(x, y, w, h, fill=None, stroke=None, sw=0, rx=0, d=0, dash=None, opacity=None, extra=''):
    a = ' x="%g" y="%g" width="%g" height="%g"' % (x, y, w, h)
    fc, fo = rgba_split(fill) if fill else ('none', None)
    a += ' fill="%s"' % fc
    if opacity is not None: a += ' fill-opacity="%g"' % opacity
    elif fo is not None: a += ' fill-opacity="%g"' % fo
    if stroke:
        sc, so = rgba_split(stroke)
        a += ' stroke="%s" stroke-width="%g"' % (sc, sw)
        if so is not None: a += ' stroke-opacity="%g"' % so
    if dash: a += ' stroke-dasharray="%s"' % dash
    if rx: a += ' rx="%g"' % rx
    E('<rect%s%s/>' % (a, (' ' + extra) if extra else ''), d)

def line(x1, y1, x2, y2, stroke, sw, dash=None, d=0):
    sc, so = rgba_split(stroke)
    a = ' x1="%g" y1="%g" x2="%g" y2="%g" stroke="%s" stroke-width="%g" stroke-linecap="round"' % (x1, y1, x2, y2, sc, sw)
    if so is not None: a += ' stroke-opacity="%g"' % so
    if dash: a += ' stroke-dasharray="%s"' % dash
    E('<line%s/>' % a, d)

def text(s, x, y, size, fam, weight=400, fill=INK, anchor='start', ls=0, style=None,
         opacity=None, d=0, extra=''):
    fam_s = {'display': 'Bangers', 'body': 'IBM Plex Sans', 'mono': 'IBM Plex Mono'}[fam]
    fc, fo = rgba_split(fill)
    a = ' x="%g" y="%g" font-family="\'%s\'" font-size="%g" fill="%s" text-anchor="%s"' % (x, y, fam_s, size, fc, anchor)
    if fo is not None and opacity is None: a += ' fill-opacity="%g"' % fo
    if weight != 400: a += ' font-weight="%d"' % weight
    if ls: a += ' letter-spacing="%g"' % ls
    if style: a += ' font-style="%s"' % style
    if opacity is not None: a += ' fill-opacity="%g"' % opacity
    E('<text%s%s>%s</text>' % (a, (' ' + extra) if extra else '', esc(s)), d)

def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

def ring(cx, cy, outer, border, color, fill, d=0):
    """box with thick border drawn as fill rect + evenodd ring (Figma-friendly)."""
    rect(cx - outer/2 + 0, cy - outer/2, outer, outer, fill=fill, d=d)
    inner = outer - 2 * border
    p = ('M%g %g h%g v%g h-%g Z M%g %g h%g v%g h-%g Z'
         % (cx-outer/2, cy-outer/2, outer, outer, outer,
            cx-inner/2, cy-inner/2, inner, inner, inner))
    E('<path d="%s" fill="%s" fill-rule="evenodd"/>' % (p, color), d)

def hatch_path(w, h, period=72.0, stripe=36.0):
    """path data of 45deg stripes region 0<=x-y<stripe*sqrt2 inside 0..w x 0..h (local coords)."""
    D = stripe * math.sqrt(2)
    out = []
    k = int(math.floor(-h / D)) - 1
    while k * D < w + D:
        x0 = k * D
        p1x, p1y = x0, 0
        p2x, p2y = x0 + D, 0
        p3x, p3y = x0 + D + h, h
        p4x, p4y = x0 + h, h
        out.append('M%g %g L%g %g L%g %g L%g %g Z' % (p1x, p1y, p2x, p2y, p3x, p3y, p4x, p4y))
        k += 1
    return ' '.join(out)

HATCH_CLIPS = []
def hatch_rect(x, y, w, h, a, b, tag):
    """card bg = solid b + clipped 45deg stripes of a (in card-local coords)."""
    cid = 'clip-' + tag
    HATCH_CLIPS.append('<clipPath id="%s" clipPathUnits="userSpaceOnUse" transform="translate(%g,%g)"><rect x="0" y="0" width="%g" height="%g"/></clipPath>' % (cid, x, y, w, h))
    rect(x, y, w, h, fill=b, d=0)
    E('<path d="%s" fill="%s" clip-path="url(#%s)" transform="translate(%g,%g)"/>' % (hatch_path(w, h), a, cid, x, y))

# ============================================================
#  components
# ============================================================
def chip(x, y, s, size, fam, weight, bg, fg, padl, padr, padt, padb, ls=0, lh=1.1, style=None, opacity=None, extra_tspan=None, d=0, cx=None):
    """a label chip: rect + centered-ish left-aligned text (CSS: text sits at padding-left)."""
    t = s.upper() if style == 'uppercase' else s
    tw = text_w(t, size, fam, weight, ls)
    h = padt + lh * size + padb
    w = padl + tw + padr
    if cx is not None:
        x = cx - w / 2
    rect(x, y, w, h, fill=bg)
    by = base_y(y + padt, size, lh * size, fam, weight)
    return (x, y, w, h, by)

def leader_node(p):
    pass

def card_transform(x, y, w, h, rz, skx, sky):
    return 'translate(%g,%g) translate(%g,%g) rotate(%g) matrix(1,%g,%g,1,0,0) translate(%g,%g)' % (
        x, y, w/2, h/2, rz, math.tan(math.radians(sky)), math.tan(math.radians(skx)), -w/2, -h/2)

def tilt_for(n):
    return (math.sin(n*2.1)*0.7, math.sin(n*1.3)*0.4, math.cos(n*1.7)*0.25)

def draw_slot(px, py, pw, ph, hint, light):
    """placeholder slot: dashed inset box + centered wrapped hint text (padding-box px offsets)."""
    x, y, w, h = px + 150, py + 300, pw - 300, ph - 450
    col = 'rgba(255,255,255,0.95)' if light else 'rgba(20,20,20,0.6)'
    bcol = 'rgba(255,255,255,0.7)' if light else 'rgba(20,20,20,0.35)'
    rect(x, y, w, h, fill='none', stroke=bcol, sw=10, dash='30 30')
    size, ls = 96, 2
    lh = 1.35 * size
    inner = w - 240 - 20
    ln = wrap(hint, inner, size, 'mono', 400, ls)
    total = lh * len(ln)
    top = y + 10 + (h - 20 - total) / 2
    for i, l in enumerate(ln):
        by = top + i * lh + lh/2 + 0.35*size
        text(l, x + w/2, by, size, 'mono', 400, col, 'middle', ls)

def draw_corner(cx, cy, color):
    ring(cx, cy, 76, 16, color, '#fff')

def draw_index(n, pw, tag):
    s = ('#%02d' % n) if isinstance(n, int) else n
    size, ls = 100, 4
    tw = text_w(s, size, 'mono', 600, ls)
    w = 112 + tw; h = 52 + 1.2 * size
    x, y = pw - 68 - w, 68
    rect(x, y, w, h, fill=INK, rx=24)
    text(s, x + 56, base_y(y + 26, size, 1.2*size, 'mono', 600), size, 'mono', 600, '#f4efe6', ls=ls)

def draw_label(g, title, d=0):
    gname, gcolor = GROUP[g]
    s1, s2, s3 = gname, ' · ', title
    size, ls = 92, 3
    w = 56 + text_w(s1+s2+s3, size, 'mono', 600, ls) + 70
    h = 149.2
    rect(0, -150, w, h, fill=gcolor, d=d)
    by = base_y(-150 + 26, size, 1.1*size, 'mono', 600)
    # one text with tspan opacities
    x0 = 56
    E('<text x="%g" y="%g" font-family="\'IBM Plex Mono\'" font-size="%g" fill="#fff" letter-spacing="%g" font-weight="600">' % (x0, by, size, ls), d)
    for part, op in ((s1, 1.0), (s2, 0.6), (s3, 1.0)):
        E('<tspan fill-opacity="%g">%s</tspan>' % (op, esc(part)), d)
    E('</text>', d)
    return w

def panel(pid, extra_draw=None):
    x, y, w, h = R[pid]
    n, title, g, hint, variant = META[pid]
    gcolor = GROUP[g][1]
    nn = n if isinstance(n, int) else 5
    _, skx, sky = tilt_for(nn)
    rz = ROT.get(pid, tilt_for(nn)[0])
    g_start('#%s %s' % (str(n).zfill(2) if isinstance(n, int) else str(n), title))
    E('<g transform="%s">' % card_transform(x, y, w, h, rz, skx, sky))
    d2 = 1
    # shadow
    rect(26, 26, w, h, fill=INK, d=d2)
    # bg
    if variant == 'flat':
        rect(0, 0, w, h, fill='#e0ddd3', d=d2)
    elif variant == 'white':
        rect(0, 0, w, h, fill='#ffffff', d=d2)
    elif variant == 'yellow':
        rect(0, 0, w, h, fill='#f4d85a', d=d2)
    elif variant == 'dark':
        hatch_rect_s(d2, w, h, '#2c2a28', '#262422', '%s-%s' % (pid, 'dark'))
    else:
        hatch_rect_s(d2, w, h, '#e3e0d7', '#dcd9cf', '%s-%s' % (pid, 'gray'))
    rect(0, 0, w, h, fill='none', stroke=INK, sw=BORDER, d=d2)
    # content (slot by default)
    if extra_draw:
        extra_draw(w, h)
    elif hint:
        E('<g>', d2); draw_slot(18, 18, w - 36, h - 36, hint, variant == 'dark'); E('</g>', d2)
    draw_label(g, title, d=d2)
    draw_index(n, w, pid)
    draw_corner(w, 0, gcolor)
    draw_corner(0, h, gcolor)
    draw_corner(w, h, gcolor)
    E('</g>', 0)
    g_end(0)

_hatch_defs = []
def hatch_rect_s(d, w, h, a, b, tag):
    cid = 'hatch-' + tag
    _hatch_defs.append('<clipPath id="%s"><rect x="0" y="0" width="%g" height="%g"/></clipPath>' % (cid, w, h))
    rect(0, 0, w, h, fill=a, d=d)  # flat: stripes dropped for legibility

# ---------------- panel-specific content (drawn in padding-box coords +18) ----------------
def content_C(w, h):
    E('<g transform="translate(118,268)">')
    # tree edges
    tw_, row, gap = 2848, 262, 36
    tree_h = 5*row + 4*gap
    colxy = {'a': (0, 460), 'b': (550, 830), 'c': (1470, 1378)}
    rowy = lambda r: r * (row + gap)
    nodes = {
        'A': ('a', tree_h/2 - 150, 300, 'grey', 'A', '100%', 'all images'),
        'S': ('b', rowy(0), 2*row+gap, 'grey', 'S', '64.1%', 'one ReGT label'),
        'N': ('b', rowy(2), row, 'grey', 'N', '4.0%', 'no ImageNet-1k object'),
        'M': ('b', rowy(3), 2*row+gap, 'grey', 'M', '31.9%', 'several ReGT labels'),
        'S+': ('c', rowy(0), row, 'green', 'S+', '58.4%', 'ImGT label is the ReGT label'),
        'S-': ('c', rowy(1), row, 'red', 'S−', '5.6%', 'ImGT label is not the ReGT label'),
        'M+': ('c', rowy(3), row, 'green', 'M+', '29.4%', 'ImGT label is among the ReGT labels'),
        'M-': ('c', rowy(4), row, 'red', 'M−', '2.5%', 'ImGT label is not among the ReGT labels'),
    }
    tone = {'grey': ('#ffffff', 0.6), 'green': ('#2aa876', 0.34), 'red': ('#e0412f', 0.30)}
    E('<g id="splits-edges">')
    for pk, ck in [('A','S'), ('A','N'), ('A','M'), ('S','S+'), ('S','S-'), ('M','M+'), ('M','M-')]:
        p, c = nodes[pk], nodes[ck]
        x1 = colxy[p[0]][0] + colxy[p[0]][1]; x2 = colxy[c[0]][0]
        y1 = p[1] + p[2]/2; y2 = c[1] + c[2]/2; mid = (x1+x2)/2
        E('<path d="M%g %g H%g V%g H%g" fill="none" stroke="%s" stroke-width="10"/>' % (x1, y1, mid, y2, x2, INK))
    E('</g>')
    E('<g id="splits-nodes">')
    for k, (cn, ny, nh, tn, code, pct, desc) in nodes.items():
        nx, nw = colxy[cn]
        fill, op = tone[tn]
        rect(nx, ny, nw, nh, fill=INK)
        rect(nx+10, ny+10, nw-20, nh-20, fill=fill, opacity=op)
        # text: baseline-aligned code + pct, desc below; block vertically centered
        fs_c, fs_p, fs_d = 92, 100, 54
        gap_txt = 26
        wc = text_w(code, fs_c, 'mono', 700); wp = text_w(pct, fs_p, 'body', 700)
        content_h = max(font('mono',700)['asc']*fs_c, font('body',700)['asc']*fs_p) + 14 + fs_d*1.1 + font('body',600)['desc']*fs_d
        top = ny + (nh - content_h)/2
        # baseline row: items-baseline -> shared baseline at top + max ascent
        asc = max(font('mono',700)['asc']*fs_c, font('body',700)['asc']*fs_p)
        by = top + asc
        x0 = nx + 44
        text(code, x0, by, fs_c, 'mono', 700)
        text(pct, x0 + wc + gap_txt, by, fs_p, 'body', 700)
        by2 = by + 14 + font('body',600)['desc']*fs_d + font('body',600)['asc']*fs_d  # hmm simpler: desc line top = by + gap? use block: desc box top = top+content_h - fs_d*1.1
        by2 = top + content_h - 14 - fs_d*1.1 + 0.0 + (fs_d*1.1 - (font('body',600)['asc']+font('body',600)['desc'])*fs_d)/2 + font('body',600)['asc']*fs_d
        text(desc, x0, by2, fs_d, 'body', 600)
    E('</g>')
    # legend
    ly = tree_h + 50
    for i, (sq, label) in enumerate([(('green',), '+ ImGT label agrees with ReGT'), (('red',), '− disagrees')]):
        lx = 0 if i == 0 else 1500
    # positions: flex row gap110 with two groups, group gap24; approximate widths
    s1 = '+ ImGT label agrees with ReGT'; s2 = '− disagrees'
    w1 = 64 + 24 + text_w(s1, 60, 'body', 600); lx1 = 0; lx2 = lx1 + w1 + 110
    byl = base_y(ly, 60, 1.2*60, 'body', 600)
    rect(lx1, ly + (1.2*60-64)/2, 64, 64, fill='#2aa876', opacity=0.34); rect(lx1, ly + (1.2*60-64)/2, 64, 64, fill='none', stroke=INK, sw=8)
    text(s1, lx1 + 88, byl, 60, 'body', 600)
    rect(lx2, ly + (1.2*60-64)/2, 64, 64, fill='#e0412f', opacity=0.30); rect(lx2, ly + (1.2*60-64)/2, 64, 64, fill='none', stroke=INK, sw=8)
    text(s2, lx2 + 88, byl, 60, 'body', 600)
    E('</g>')

def qr_block(qr, logo, x, y, size):
    E('<g id="qr-%s">' % qr)
    E(svg_asset_inline(qr, INK, x, y, size))
    E('</g>')
    ls_ = size * 0.232
    E(use_img(logo, x + size*0.384, y + size*0.384, ls_, ls_))

def link_column(side, kicker, title, qr, logo, link, pw):
    half = (pw - 36) / 2
    x0 = 18 + (0 if side == 'left' else half)
    cpx0, cpx1 = x0 + 130, x0 + half - 130
    # block1: qr + kicker/title column ; block2: link line ; column vertically centered
    b1h = 1150
    colw = 1500
    k_size, k_ls = 100, 10
    kchip_h = 26 + 1.1*k_size + 22
    lines_t = wrap(title, colw, 190, 'body', 700)
    t_h = 50 + len(lines_t) * 1.05*190
    b2h = 1.2*100
    gap = 130
    total = b1h + gap + b2h
    top = ( (1640 if False else 0), 0)
    # center in full height h - handled by caller passing height
    return dict(side=side, x0=x0, cpx0=cpx0, cpx1=cpx1, half=half, b1h=b1h, colw=colw, kchip_h=kchip_h,
                lines_t=lines_t, t_h=t_h, b2h=b2h, gap=gap, total=total, kicker=kicker, title=title, qr=qr, logo=logo, link=link, k_size=k_size, k_ls=k_ls)

def draw_linkcol(dct, height, x_shift=0):
    E('<g id="linkcol-%s">' % dct['side'])
    total = dct['total']
    top = (height - total) / 2
    x0 = dct['x0'] + x_shift
    b1y = top
    qr_block(dct['qr'], dct['logo'], dct['cpx0'], b1y, 1150)
    tx = dct['cpx0'] + 1150 + 100
    ksize, kls = dct['k_size'], dct['k_ls']
    ktext = dct['kicker'].upper()
    kw = 56 + text_w(ktext, ksize, 'mono', 600, kls) + 70
    rect(tx, b1y, kw, dct['kchip_h'], fill=GROUP['link'][1])
    text(ktext, tx + 56, base_y(b1y + 26, ksize, 1.1*ksize, 'mono', 600), ksize, 'mono', 600, '#fff', ls=kls)
    ty = b1y + dct['kchip_h'] + 50
    for i, l in enumerate(dct['lines_t']):
        text(l, tx, ty + i*1.05*190 + (1.05*190 - (font('body',700)['asc']+font('body',700)['desc'])*190)/2 + font('body',700)['asc']*190, 190, 'body', 700)
    ly = b1y + 1150 + dct['gap'] + 1.2*100/2 + 0.35*100
    text(dct['link'], dct['cpx0'] + x_shift, ly, 100, 'mono', 600, ls=-1)
    E('</g>')

def qr_content(w, h):
    a = link_column('left', 'Dataset', 'Labels, boxes, attributes', 'qr-hf.svg', 'logo-hf.png',
                    'huggingface.co/datasets/vrg-prague/ReImageNet', w)
    b = link_column('right', 'Tool', 'Annotation Preview and Review', 'qr-vrg.svg', 'logo-vrg.png',
                    'klarajanouskova.github.io/ImageNet', w)
    draw_linkcol(a, h - 36, 0)
    draw_linkcol(b, h - 36, 0)
    mx = 18 + (w - 36) / 2
    line(mx, 168, mx, h - 168, 'rgba(20,20,20,0.3)', 10, '30 30')

def attr_chip2(x, y, name, color):
    size, ls = 76, 3
    w = 34 + text_w(name, size, 'mono', 600, ls) + 46
    rect(x, y, w, 1.1*size + 28, fill=color)
    text(name, x + 34, base_y(y + 16, size, 1.1*size, 'mono', 600), size, 'mono', 600, '#fff', ls=ls)
    return 1.1*size + 28

def attr_note(x, y, w, name, color, text_s):
    ch = attr_chip2(x, y, name, color)
    ty = y + ch + 12
    ln = wrap(text_s, w, 74, 'body', 600)
    for i, l in enumerate(ln):
        text(l, x, ty + i*1.12*74 + 0.85*74, 74, 'body', 600)
    return ch + 12 + len(ln)*1.12*74

_clipn = [0]
def attr_cell(x, y, w, name, color, src, desc, pos='center'):
    ih = w * 3/4
    uri, iw, ih0 = img_ref(src)
    k = max(w / iw, ih / ih0)
    dw, dh = iw * k, ih0 * k
    ox = (w - dw) / 2
    oy = (ih - dh) if pos != 'center' else (ih - dh) / 2
    _clipn[0] += 1
    cid = 'crop-%d' % _clipn[0]
    _hatch_defs.append('<clipPath id="%s"><rect x="%g" y="%g" width="%g" height="%g"/></clipPath>' % (cid, x, y, w, ih))
    E('<g clip-path="url(#%s)"><image x="%g" y="%g" width="%g" height="%g" href="%s" xlink:href="%s" preserveAspectRatio="none"/></g>'
      % (cid, x + ox, y + oy, dw, dh, uri, uri))
    attr_note(x, y + ih + 18, w, name, color, desc)

def example_img(x, y, src, height, tag=None, center_w=None):
    uri, iw, ih0 = img_ref(src)
    w = height * iw / ih0
    x0 = x - w/2 if center_w is None else x
    E(use_img(src, x0, y, w, height))
    if tag:
        text(tag, x0 + w/2, y + height + 12 + 0.85*64, 64, 'mono', 600, anchor='middle')
    return w

def a2_content(w, h):
    E('<g id="attributes">')
    x0, y0, y = 128, 278, 278
    cw = (w - 36 - 220 - 60) / 2
    rows_gap = 44
    # row 1
    attr_cell(x0, y, cw, 'rendition', ATTR['rendition'], 'attr-rendition-piano.jpg', 'Toy, drawing or other stylized depiction')
    attr_cell(x0 + cw + 60, y, cw, 'crowd', ATTR['crowd'], 'attr-crowd-flamingo.jpg', '5+ instances of one class, collapsed into a single box', 'bottom')
    # note heights for row advance: chip + 12 + wrapped lines
    def note_h(name, txt):
        c = 1.1*76 + 28
        return c + 12 + len(wrap(txt, cw, 74, 'body', 600))*1.12*74
    r1 = cw*3/4 + 18 + max(note_h('rendition', 'Toy, drawing or other stylized depiction'), note_h('crowd', '5+ instances of one class, collapsed into a single box'))
    y += r1 + rows_gap
    attr_cell(x0, y, cw, 'text-recognition', ATTR['text'], 'attr-text-theater.jpg', 'Class is only recognizable by reading the text')
    attr_cell(x0 + cw + 60, y, cw, 'reflection', ATTR['reflection'], 'attr-reflection-mau.jpg', 'Object seen in a mirror or water surface')
    r2 = cw*3/4 + 18 + max(note_h('text-recognition', 'Class is only recognizable by reading the text'), note_h('reflection', 'Object seen in a mirror or water surface'))
    y += r2 + 18
    # dominant: two example images centered in two half columns, gap 60
    colw2 = (w - 36 - 220 - 60) / 2
    cx1 = x0 + colw2/2
    cx2 = x0 + colw2 + 60 + colw2/2
    w1 = example_img(cx1, y, 'attr-dominant-terriers.jpg', 720, 'both dominant')
    w2 = example_img(cx2, y, 'attr-notdominant-cap.jpg', 720, 'not dominant')
    y += 720 + 12 + 1.2*64 + 18
    attr_note(x0, y, w - 220, 'dominant', ATTR['dominant'], 'Noticed immediately: a judgment, not a matter of size')
    E('</g>')

def b2_content(w, h):
    E('<g id="key-numbers">')
    x0, y0 = 138, 288
    ch = h - 36 - 360
    rows = [
        ('≈12%', ['of the original ImageNet-1k', 'labels are incorrect']),
        ('31.9%', ['of images are multilabel']),
        ('4.0%', ['of images contain no object', 'from an ImageNet-1k class']),
    ]
    n = len(rows)
    rh = ch / n
    tfs = min(150, 6.3/100 * (w - 36 - 240 - 1050 - 70))
    for i, (num, lns) in enumerate(rows):
        ry = y0 + i * rh
        if i:
            line(x0, ry, w - 138 - 0, ry, 'rgba(20,20,20,0.25)', 10, '30 30')
        fs = fit_line(num, 1050, 330, 'display', 400, 0.01)
        text(num, x0, ry + rh/2 + 0.35*fs, fs, 'display', 400, style='italic', ls=fs*0.01/fs)
        tx = x0 + 1050 + 70
        lh_ = 1.12 * tfs
        th = lh_ * len(lns)
        for j, l in enumerate(lns):
            text(l, tx, ry + (rh - th)/2 + j*lh_ + lh_/2 + 0.33*tfs, tfs, 'body', 600)
    E('</g>')

# ---------------- title card ----------------
def attr_chip_box(x, y, label):
    size = 96
    tw = text_w(label, size, 'mono', 600)
    content_h = max(90, 1.2*size)
    h = content_h + 36 + 40
    w = 40 + 90 + 40 + tw + 60 + 40
    rect(x, y, w, h, fill='#fff')
    # border ring 20
    p = ('M%g %g h%g v%g h-%g Z M%g %g h%g v%g h-%g Z' % (x, y, w, h, w, x+20, y+20, w-40, h-40, w-40))
    E('<path d="%s" fill="%s" fill-rule="evenodd"/>' % (p, INK))
    # checkbox
    bx, by = x + 60, y + 20 + (content_h - 90)/2
    rect(bx, by, 90, 90, fill=RED)
    ring(bx + 45, by + 45, 90+0, 0, None, None) if False else None
    p2 = 'M%g %g h90 v90 h-90 Z M%g %g h62 v62 h-62 Z' % (bx, by, bx+14, by+14)
    E('<path d="%s" fill="%s" fill-rule="evenodd"/>' % (p2, INK))
    E('<path d="M%g %g l%g %g l%g %g" stroke="#fff" stroke-width="16" fill="none" stroke-linecap="round"/>'
      % (bx + 45 - 22, by + 45 + 2, 12, 18, 26, -32))
    text(label, bx + 90 + 40, y + 20 + content_h/2 + 0.35*size, size, 'mono', 600)
    return w

# ============================================================
#  main
# ============================================================
def main():
    E('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="%d" height="%d" viewBox="0 0 %d %d">' % (W, H, W, H))
    E('<style type="text/css">')
    E('/* Figma ignores @font-face and matches the family names (all are Figma cloud fonts);'
      ' browsers use these embedded faces so the poster renders correctly everywhere). */')
    faces = [
        ('Bangers', 400, 'bangers-400-normal.ttf'),
        ('IBM Plex Sans', 400, 'plexsans-400-normal.ttf'),
        ('IBM Plex Sans', 600, 'plexsans-600-normal.ttf'),
        ('IBM Plex Sans', 700, 'plexsans-700-normal.ttf'),
        ('IBM Plex Mono', 400, 'plexmono-400-normal.ttf'),
        ('IBM Plex Mono', 600, 'plexmono-600-normal.ttf'),
    ]
    for fam, wt, fn in faces:
        b64 = base64.b64encode(open(os.path.join(FONTS, fn), 'rb').read()).decode()
        E("@font-face { font-family: '%s'; font-weight: %d; font-style: normal; src: url(data:font/ttf;base64,%s) format('truetype'); }" % (fam, wt, b64))
    E('</style>')
    E('<defs>')
    E('<clipPath id="clip-poster"><rect x="0" y="0" width="%d" height="%d"/></clipPath>' % (W, H))
    E('</defs>')
    # canvas
    E('<g id="canvas">')
    rect(0, 0, W, H, fill='#ffffff')
    gp = []
    for x in range(0, W + 1, 200): gp.append('M%d 0V%d' % (x, H))
    for y in range(0, H + 1, 200): gp.append('M0 %dH%d' % (y, W))
    E('<path d="%s" stroke="#141414" stroke-opacity="0.06" stroke-width="3" fill="none"/>' % ' '.join(gp))
    gp = []
    for x in range(0, W + 1, 1000): gp.append('M%d 0V%d' % (x, H))
    for y in range(0, H + 1, 1000): gp.append('M0 %dH%d' % (y, W))
    E('<path d="%s" stroke="#141414" stroke-opacity="0.12" stroke-width="3" fill="none"/>' % ' '.join(gp))
    E('</g>')
    # leader links (under panels)
    E('<g id="leader-lines">')
    for pid in R:
        x, y, w, h = R[pid]
        c = (x + w/2, y + h/2)
        rot = math.radians(ROT.get(pid, 0))
        dx0, dy0 = TITLE[0] - c[0], TITLE[1] - c[1]
        import math as _m
        dx = _m.cos(-rot)*dx0 - _m.sin(-rot)*dy0
        dy = _m.sin(-rot)*dx0 + _m.cos(-rot)*dy0
        t = min(abs(dx/w) and (w/2/abs(dx)) or 1e18, (h/2/abs(dy)) if dy else 1e18) if (dx or dy) else 1e18
        t = min((w/2/abs(dx)) if dx else 1e18, (h/2/abs(dy)) if dy else 1e18)
        px, py = c[0] + dx*t, c[1] + dy*t
        ex = px - c[0]; ey = py - c[1]
        exr, eyr = c[0] + _m.cos(rot)*ex - _m.sin(rot)*ey, c[1] + _m.sin(rot)*ex + _m.cos(rot)*ey
        color = GROUP[META[pid][2]][1]
        E('<g id="link-%s" stroke-linecap="round">' % pid)
        line(TITLE[0], TITLE[1], exr, eyr, INK, 34)
        line(TITLE[0], TITLE[1], exr, eyr, color, 20, '70 40')
        E('</g>')
    E('</g>')

    cont = {'C': content_C, 'QR': qr_content, 'A2': a2_content, 'B2': b2_content}
    for pid in ['A', 'B', 'C', 'D', 'QR', 'A2', 'B2'] + ['M%d' % i for i in range(1, 11)]:
        panel(pid, cont.get(pid))

    # ---- title block (full) ----
    g_start('title-card')
    E('<g transform="translate(%g,%g) rotate(-1.2) translate(-3350,-2300)">' % (TITLE[0], 2300))
    d = 1
    rect(140, 270, 6480, 4080, fill=INK, d=d)
    rect(110, 240, 6480, 4080, fill='#f4efe6', d=d)
    rect(110, 240, 6480, 4080, fill='none', stroke=INK, sw=36, d=d)
    rect(80, 210, 6540, 4140, fill='none', stroke=RED, sw=40, d=d)
    for hx in (60, 3350, 6640):
        for hy in (190, 2280, 4370):
            if hx == 3350 and hy == 2280: continue
            ring(hx, hy, 140, 36, RED, '#fff', d=d)
    s = 'ReGT: ReImageNet'
    size, ls = 110, 4
    wchip = 70 + text_w(s, size, 'mono', 600, ls) + 90
    rect(48, 20, wchip, 30 + 1.2*size + 24, fill=RED, d=d)
    text(s, 118, base_y(50, size, 1.2*size, 'mono', 600), size, 'mono', 600, '#fff', ls=ls, d=d)
    xx = 60
    chip_ys = 4600 - 20 - 191.2
    for lab in ('multilabel', 'boxes', 'revised classes', 'attributes'):
        xx += attr_chip_box(xx, chip_ys, lab) + 60
    # ---- text column (centered) ----
    CW = 6700 - 120 - 172
    items = []
    s_neur = 'NEURIPS 2026 · SPOTLIGHT'
    items.append(('plain', 1.2*92, 180, 0, lambda y: text(s_neur, 3350, y + 0.85*92, 92, 'mono', 600, ls=26, anchor='middle')))
    fs1 = fit_line('DOOMED TO RE-ANNOTATE,', CW - 1000, 640, 'display', 400, 0.01)
    h1 = 0.95 * fs1
    def line_display(s_, fs_, target_ls, color, lh, skew, rot_, y0):
        tw_ = text_w(s_, fs_, 'display', 400, fs_*0.01)
        by_ = y0 + lh/2 + 0.35*fs_
        E('<text x="%g" y="%g" font-family="\'Bangers\'" font-size="%g" fill="%s" text-anchor="middle" transform="translate(3350,%g) skewX(%g) rotate(%g)" letter-spacing="%g">%s</text>'
          % (0, 0, fs_, color, by_, skew, rot_, fs_*0.01, esc(s_)))
    def it1(y0):
        line_display('DOOMED TO RE-ANNOTATE,', fs1, 0, INK, 0.95*fs1, -8, 0, y0)
    items.append(('fit', h1, 30, 0, it1))
    fs2 = fit_line('FOREVER!', CW - 2300, 880, 'display', 400, 0.01)
    h2 = 0.92 * fs2
    def it2(y0):
        line_display('FOREVER!', fs2, 0, RED, 0.92*fs2, -8, -1.5, y0)
    items.append(('fit', h2, 30, 0, it2))
    fs3 = fit_line('The ImageNet Story', CW - 700, 400, 'display', 400, 0.015)
    h3 = 1.0 * fs3
    chip_h = 30 + 10 + h3
    def it3(y0):
        tw_ = text_w('The ImageNet Story', fs3, 'display', 400, fs3*0.015)
        cwid = 140*2 + tw_
        E('<g transform="translate(3350,%g) skewX(-6) rotate(-1)">' % (y0 + chip_h/2))
        rect(-cwid/2, -chip_h/2, cwid, chip_h, fill=INK)
        text('The ImageNet Story', 0, 0.35*fs3, fs3, 'display', 400, '#f4d85a', anchor='middle', ls=fs3*0.015)
        E('</g>')
    items.append(('fit', chip_h, 40, 0, it3))
    fs4 = fit_line('Illia Volkov · Nikita Kisel · Tetiana Mishkina · Klara Janouskova · Jiri Matas', CW - 450, 150, 'mono', 600, 0)
    h4 = 1.3 * fs4
    def it4(y0):
        text('Illia Volkov · Nikita Kisel · Tetiana Mishkina · Klara Janouskova · Jiri Matas', 3350, y0 + h4/2 + 0.33*fs4, fs4, 'mono', 600, anchor='middle')
    items.append(('fit', h4, 250, 0, it4))
    fs5 = fit_line('Visual Recognition Group · Czech Technical University in Prague', CW - 700, 112, 'mono', 400, 0)
    h5 = 1.3 * fs5
    def it5(y0):
        text('Visual Recognition Group · Czech Technical University in Prague', 3350, y0 + h5/2 + 0.33*fs5, fs5, 'mono', 400, opacity=0.8, anchor='middle')
    items.append(('fit', h5, 40, 0, it5))
    box_top, box_bot = 190 + 86, 4600 - 230 - 86 - 440
    total = sum(it[1] for it in items) + sum(it[2] for it in items[1:])
    y0 = box_top + (box_bot - box_top - total) / 2
    for kind, hh, mt, _, fn in items:
        y0 += mt
        fn(y0)
        y0 += hh
    # logos
    uri1, w1_, h1_ = img_ref('logo-vrg-full.png')
    w1d = 380 * w1_ / h1_
    w2d = 380 * 1241.2 / 604.778
    uri3, w3_, h3_ = img_ref('logo-neurips.png')
    w3d = 380 * w3_ / h3_
    ly0 = 4600 - 230 - 86 - 210 - 380
    x2a = 3350 - w2d/2
    E(svg_asset_inline('logo-ctu.svg', None, x2a, ly0, 380 * 0 + 0) if False else '<g transform="translate(%g,%g) scale(%g)">%s</g>' % (x2a, ly0, 380/604.778, open(os.path.join(ASSETS, 'logo-ctu.svg')).read()[open(os.path.join(ASSETS, 'logo-ctu.svg')).read().index('>', open(os.path.join(ASSETS, 'logo-ctu.svg')).read().index('<svg'))+1:open(os.path.join(ASSETS, 'logo-ctu.svg')).read().rindex('</svg>')]))
    E(use_img('logo-vrg-full.png', x2a - 507 - w1d, ly0, w1d, 380))
    E(use_img('logo-neurips.png', 3350 + w2d/2 + 507, ly0, w3d, 380))
    E('</g>', 0)
    g_end(0)

    # nodes on top
    E('<g id="leader-nodes">')
    for pid in R:
        x, y, w, h = R[pid]
        c = (x + w/2, y + h/2)
        import math as _m
        rot = math.radians(ROT.get(pid, 0))
        dx0, dy0 = TITLE[0] - c[0], TITLE[1] - c[1]
        dx = _m.cos(-rot)*dx0 - _m.sin(-rot)*dy0
        dy = _m.sin(-rot)*dx0 + _m.cos(-rot)*dy0
        t = min((w/2/abs(dx)) if dx else 1e18, (h/2/abs(dy)) if dy else 1e18)
        px, py = c[0] + dx*t, c[1] + dy*t
        ex, ey = px - c[0], py - c[1]
        exr, eyr = c[0] + _m.cos(rot)*ex - _m.sin(rot)*ey, c[1] + _m.sin(rot)*ex + _m.cos(rot)*ey
        color = GROUP[META[pid][2]][1]
        rect(exr - 52, eyr - 52, 104, 104, fill='#fff', stroke=color, sw=26)
    E('</g>')
    # frame
    rect(20, 20, W - 40, H - 40, fill='none', stroke=INK, sw=40, d=0)
    # defs: hatch clip paths
    if _hatch_defs:
        E('<defs>')
        for dd in _hatch_defs: E(dd)
        E('</defs>')
    E('</svg>')
    open(OUT, 'w').write('\n'.join(lines))
    print('wrote', OUT, len(lines), 'lines,', os.path.getsize(OUT), 'bytes')

if __name__ == '__main__':
    main()
