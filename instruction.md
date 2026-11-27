# Poster editing workflow (read first in every session)

The user edits the NeurIPS poster by sending short edit requests in chat. Your job:
apply each edit to the React app immediately so the browser hot-reloads. Do not ask for
confirmation on ordinary edits — just do them. The SVG export script stays untouched
until the user asks to export (section 3).

## 1. Serve the page on 8443 (do this at session start)

The dev server is NOT auto-started on this machine. Check first:

    curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://localhost:8443/

If not 200, start it (Node and pnpm are already installed; deps installed in node_modules):

    export PATH="$HOME/.local/node/bin:$PATH"
    cd /home/kiselnik/proj/neurips-poster-template
    nohup pnpm dev --host --port 8443 >/tmp/vite.log 2>&1 &

Node 22 lives in `~/.local/node` (in PATH via ~/.bashrc); pnpm 10.34.3 via corepack.
If node_modules is missing: `pnpm install`. The server must stay running across the
whole session. Page is served over plain HTTP (not https) on 0.0.0.0:8443; the user
reaches it through a VS Code port-forward of 8443.

## 2. Applying edits

- Poster v2 lives in [src/App.tsx](src/App.tsx); v1 (rarely touched) in
  [src/versions/PosterV1CorkboardComic.tsx](src/versions/PosterV1CorkboardComic.tsx).
  URL options: `?v=1`, `?bg=classic|white|color|gray`, `?canvas=<hex>`.
- Edit App.tsx only. Vite hot-reloads; no restart or export needed to see changes.
- Do NOT update [tools/poster_svg.py](tools/poster_svg.py) as you go — the user
  explicitly asked for that. It lags behind App.tsx on purpose. Only when the user
  says the poster is final / asks to export (or "sync the script"), first bring the
  script in line with App.tsx (it is a hand-written duplicate: geometry R/ROT, META
  texts, GROUP colors, title block, layout), then export.

## 3. Final export (only when the user asks)

1. Sync tools/poster_svg.py against current App.tsx (diff the constants and layout
   logic), then run:

    cd /home/kiselnik/proj/neurips-poster-template
    .venv/bin/python tools/poster_svg.py   # writes poster.svg (fonts in .tools/fonts, assets in public/assets)

Figma export (preferred; reads the live page, no script sync needed): with the dev server
running, `node tools/figma/export.mjs` writes `figma-export/poster.svg` (editable text) and
verifies it against the page. See [tools/figma/README.md](tools/figma/README.md).

## 4. Notes

- Poster canvas is 19876 x 12600 px; all layout numbers in App.tsx are px on that canvas.
- Default card text size: 74px `font-body font-semibold`, line-height 1.25 (ink on the card bg). Use it for any
  new card prose so all cards match (contributions, attributes descriptions and the Problem story already do);
  scale up only on request.
- Do not kill the vite process (`pkill vite`) unless restarting it.
