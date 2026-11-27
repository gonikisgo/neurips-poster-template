# Poster → Figma export

Converts the poster as rendered by the dev server into an SVG that imports into Figma with
editable text (one text layer per line), vector cards/charts and embedded photos. It reads the
live page, so it always matches `src/App.tsx`. You don't need to sync anything by hand.

## Run

```sh
pnpm dev --host --port 8443          # dev server must be running
node tools/figma/export.mjs          # ~2.5 min incl. verification
```

Then drag `figma-export/poster.svg` into Figma. Needs the Google fonts Bangers, IBM Plex Sans and
IBM Plex Mono, which Figma has built in.

Options: `--url <page>` (default `http://localhost:8443/`, e.g. add `?bg=white`), `--out <dir>`
(default `figma-export/`), `--no-verify` (export only, ~15 s), `--crops "x,y,w,h;..."` +
`--crops-only` (1:1 page-vs-SVG crops for close inspection).

Chrome: `$CHROME`, else Playwright's headless shell in `~/.cache/ms-playwright`
(`npx playwright install chromium-headless-shell`), else `google-chrome`/`chromium` on PATH.
HTTPS requests (Google Fonts) are fetched by Node, so Chrome needs no TLS/NSS setup.

## Verification

Unless `--no-verify` is set, the exporter renders `poster.svg` in Chrome and compares it with the page at full
resolution, tile by tile, writing `diff.json`, `diff.png` (red = differing pixels) and the
worst tiles as `tile-*-{page,svg}.png`. Expect ~0.1% differing pixels: anti-aliasing on rotated
edges and dash phase. Font hinting is disabled (`--font-render-hinting=none`) because Linux
Chrome otherwise rounds HTML glyph advances to whole pixels, which SVG and Figma don't.

## Files

- `export.mjs`: drives headless Chrome over CDP, embeds assets, runs the verification
- `extract.js`: runs inside the page: walks the DOM in paint order and emits SVG (text lines,
  boxes/borders/shadows, inline SVG with computed styles baked in, patterns expanded, CSS
  gradients turned into geometry)

New CSS features the extractor doesn't know (e.g. a new kind of `background-image`) are
reported as warnings during export; extend `paintBgImage` in `extract.js` if one appears.
