// 아트 데이터(그리드·색맵·RES)는 art-data.js 참조. 여기는 렌더 로직만.
const { RES } = window.HXR_DATA;

// ── pixel renderer ─────────────────────────────────────────────────────────
// Build <rect> pixels from a char grid + color map. Origin (cx,cy) in grid cells.
// `stroke` (optional) outlines every pixel — used for the warning glow.
const px = (grid, map, p, cx, cy, stroke) => {
  if (cx == null) cx = grid[0].length / 2;
  if (cy == null) cy = grid.length / 2;
  const out = [];
  grid.forEach((row, r) => row.split('').forEach((ch, c) => {
    if (ch === ' ' || ch === '.') return;
    const f = map[ch];
    if (!f) return;
    out.push(
      <rect
        key={`${r}-${c}`}
        x={((c - cx) * p).toFixed(2)} y={((r - cy) * p).toFixed(2)}
        width={p + 0.06} height={p + 0.06} fill={f}
        stroke={stroke || undefined} strokeWidth={stroke ? 0.4 : undefined}
      />
    );
  }));
  return out;
};

// ─── drawArt — turn a registry entry into SVG ──────────────────────────────
// opts.warn → apply the entry's warning treatment (red pixel stroke / muzzle color / ring).
function drawArt(name, opts = {}) {
  const a = RES[name];
  if (!a) return null;
  const warn = !!opts.warn;

  if (a.kind === 'image') {
    const w = a.w, h = a.h, dx = a.dx || 0, dy = a.dy || 0;
    return (
      <g>
        {warn && <circle cx={dx} cy={dy} r={Math.max(w, h) / 2 + 1.5} fill="none" stroke="#f87171" strokeWidth="1.4" />}
        <image
          href={a.src} x={-w / 2 + dx} y={-h / 2 + dy} width={w} height={h}
          preserveAspectRatio="xMidYMid meet"
          style={{ imageRendering: a.smooth ? 'auto' : 'pixelated' }}
        />
      </g>
    );
  }

  // pixel
  let map = a.map;
  if (warn && a.warnMap) map = { ...map, ...a.warnMap };
  const stroke = (warn && a.warnStroke) ? '#f87171' : null;
  return px(a.grid, map, a.px ?? 2.4, a.ox, a.oy, stroke);
}

// `isImage(name)` lets a sprite know if its art was swapped to an image
// (so it can drop hand-drawn vector extras like the gem ring if you want).
const isImage = (name) => RES[name] && RES[name].kind === 'image';

window.HXR = { RES, drawArt, px, isImage };
