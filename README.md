# HEX DANMAKU · 육각 탄막

A turn-based hex bullet-hell game. Plain React 18 (UMD) + Babel-in-browser — no build step.

## Run

Just open `Hex Danmaku.html` in a browser, or serve the folder:

```bash
npx serve .       # then open the printed URL
```

(A static server is recommended so the `.jsx` files load over http rather than file://.)

## File map

| file | role |
|------|------|
| `Hex Danmaku.html` | entry point — loads React/Babel CDN + all scripts in order |
| `engine.jsx` | hex grid math + core game loop (`window.HX`) |
| `stages.jsx` | 24 stage definitions, boss attacks, progress (`window.HXS`) |
| `resources.jsx` | **ART REGISTRY** — every sprite's art in one `RES` table (`window.HXR`) |
| `sprites.jsx` | sprite components (shadow + animation wrappers, no art) |
| `screens.jsx` | menu / stage-select / clear & fail overlays |
| `app.jsx` | screen orchestration + board/HUD rendering |
| `styles.css` | all styling |
| `assets/` | drop your own sprite images here (see `assets/README.md`) |
| `docs/hex-danmaku-dev.md` | full design/logic spec |

## Script load order (matters)

`engine → stages → resources → sprites → screens → app`
Each file hangs its exports on `window` (`HX`, `HXS`, `HXR`, sprite components) since
Babel gives every `<script type="text/babel">` its own scope.

## Replacing art

All graphics swap from `resources.jsx` alone — edit a resource's pixel `grid`+`map`,
or point it at an image in `assets/`. See `assets/README.md` for the full guide.
