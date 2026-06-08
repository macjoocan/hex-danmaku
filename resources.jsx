/* ════════════════════════════════════════════════════════════════════════
 *  resources.jsx — THE ART REGISTRY.   ← swap every sprite from this one file
 * ════════════════════════════════════════════════════════════════════════
 *
 *  Every visible thing in the game (player, drone, star, wall, …) is ONE named
 *  entry in the RES table below. Game logic never touches art — so you can
 *  re-skin the whole game here without opening engine.jsx / app.jsx / stages.jsx.
 *
 *  ── TWO KINDS OF ART ──────────────────────────────────────────────────────
 *
 *  1) PIXEL  (default) — drawn from a character grid + a color map.
 *        drone: { kind:'pixel', grid: DRONE, map: DRONE_MAP, px: 2.3 },
 *     • grid : array of equal-length strings. '.' or ' ' = empty pixel.
 *     • map  : char → CSS color.   • px : size of one pixel (px).
 *     • ox/oy: origin cell (defaults to grid centre). Bigger oy lifts the art up.
 *
 *  2) IMAGE  — your own PNG / SVG / GIF. Drop the file in  assets/  then:
 *        player: { kind:'image', src:'assets/player.png', w:34, h:34 },
 *     • w/h : on-board render size in px (art is centred on its hex).
 *     • dx/dy (optional): nudge in px.
 *     • smooth:true → normal scaling (use for photo/vector art).
 *                     omit for pixel-art PNGs so they stay crisp.
 *
 *  ── HOW TO REPLACE A RESOURCE ─────────────────────────────────────────────
 *  Find its entry in RES below and either tweak the pixel grid/colors, OR
 *  switch it to an image. Example — give the hero a custom sprite:
 *
 *        player:  { kind:'image', src:'assets/hero.png', w:36, h:36 },
 *
 *  The matching sprite keeps its drop-shadow, hop / hover / spin animation and
 *  red warning glow automatically. Nothing else needs to change.
 *
 *  ── REGISTRY KEYS (what each one is) ──────────────────────────────────────
 *    player   hero / you            drone     falling bullet
 *    droneFz  bullet while frozen   star      score pickup  ★
 *    bomb     bomb pickup  ✸        tp        warp pickup   ✦
 *    hint     foresight pickup ◉    explode   explosion burst
 *    portal   stage goal gate       gem       required star (collect stages)
 *    chaser   homing enemy          spike     instant-death floor ◆
 *    turret   column cannon ▲       wall      solid block (vector — see note)
 *
 *  NOTE on `wall`: it is a vector fill of the whole hex by default. To use an
 *  image instead, set RES.wall = { kind:'image', src:'assets/wall.png', w:34,
 *  h:34 } and it will swap in just like the others.
 * ════════════════════════════════════════════════════════════════════════ */

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

// ─── Pixel grids + color maps ──────────────────────────────────────────────

// Hero (humanoid player)
const HERO_MAP = {
  o: '#0a1f38',                               // outline
  H: '#ef8a3a', h: '#fcd34d',                 // hair, hair highlight
  k: '#f7c89a', j: '#d29a6b',                 // skin, skin shadow
  e: '#0a1f38',                               // eyes
  T: '#38bdf8', t: '#cdeafe', u: '#0c4a6e',   // tunic, hi, shadow
  P: '#2563eb', p: '#1e3a8a',                 // cape, cape shadow
  b: '#fbbf24',                               // belt
  G: '#27407a',                               // pants
  B: '#0b1830',                               // boots
};
const HERO = [
  '....oooo....',
  '..ooHHHHoo..',
  '.oHHhhhhHHo.',
  '.oHhhhhhhHo.',
  '.ooHkkkkHoo.',
  '..okkkkkko..',
  '..okekkeko..',
  '..okkjjkko..',
  '...ojjjo....',
  '.PPoTTTtoo..',
  '.PpoTtTTuo..',
  '..oTTTTTuo..',
  '..obbbbbo...',
  '..oGGGGGo...',
  '.oBBo.oBBo..',
];

// Drone (enemy "bullet") — normal + frozen palettes
const DRONE_MAP = { o: '#3a0a14', R: '#fb7185', r: '#fecdd3', d: '#9f1239', E: '#fde047', e: '#7c2d12', w: '#e11d48' };
const DRONE_FZ  = { o: '#0a2a4a', R: '#93c5fd', r: '#e0f2fe', d: '#1e3a8a', E: '#bae6fd', e: '#1e3a8a', w: '#3b82f6' };
const DRONE = [
  '..oooo..',
  '.oRrrRo.',
  'oRRRRRRo',
  'wREEEERw',
  'oREeeERo',
  'oRRRRRRo',
  '.odRRdo.',
  '..o..o..',
];

// Score star
const STAR = ['...XX...', '...XX...', '..XHHX..', 'XXHHHHXX', '.XHHHHX.', '..X..X..', '.X....X.', '........'];
const STAR_MAP = { X: '#fbbf24', H: '#fde68a' };

// Bomb pickup
const BOMB = ['.....XX.', '....XF..', '..XXXXX.', '.XHHHHXX', '.XHHHHHX', '.XBHHHHX', '.XXHHHXX', '..XXXXX.'];
const BOMB_MAP = { X: '#34d399', F: '#fbbf24', H: '#6ee7b7', B: '#bbf7d0' };

// Warp / teleport pickup
const TP = ['...XX...', '..XHHX..', '.XHXXHX.', 'XHXHHXHX', 'XHXHHXHX', '.XHXXHX.', '..XHHX..', '...XX...'];
const TP_MAP = { X: '#c084fc', H: '#e9d5ff' };

// Foresight (hint) pickup
const HINT = ['........', '..OOOO..', '.OWWWWO.', 'OWIIIIWO', 'OWIPPIWO', '.OWIIWO.', '..OOOO..', '........'];
const HINT_MAP = { O: '#7c2d12', W: '#fff7ed', I: '#f97316', P: '#1c1917' };

// Explosion burst
const EXPLODE = ['X.X..X.X', '.XX..XX.', 'XXXXXXXX', '..XHHX..', '..XHHX..', 'XXXXXXXX', '.XX..XX.', 'X.X..X.X'];
const EXPLODE_MAP = { X: '#ff7a3d', H: '#fff7ed' };

// Portal / warp gate (stage goal)
const PORTAL = ['.XXXXXX.', 'XHHHHHHX', 'XHWWWWHX', 'XHWIIWHX', 'XHWIIWHX', 'XHWWWWHX', 'XHHHHHHX', '.XXXXXX.'];
const PORTAL_MAP = { X: '#6d28d9', H: '#a78bfa', W: '#e9d5ff', I: '#22d3ee' };

// Required gem (collect stages)
const GEM = ['...XX...', '..XHHX..', '..XHHX..', 'XXHHHHXX', '.XHHHHX.', '..XHHX..', '.X.XX.X.', '........'];
const GEM_MAP = { X: '#fbbf24', H: '#fffbeb' };

// Chaser enemy (angry blob)
const CHASER = ['..XXXX..', '.XEEEEX.', 'XEWEEWEX', 'XEEEEEEX', 'XEWWWWEX', 'XXWXXWXX', '.XEEEE X', '..X..X..'];
const CHASER_MAP = { X: '#a21caf', E: '#c026d3', W: '#fae8ff' };

// Spike / hazard (lethal floor) — T = bright tip, X = base
const SPIKE = ['........', '.T..T..T', '.TT.TT.T', 'XXXXXXXX', '.XXXXXX.', '..XXXX..', '...XX...', '........'];
const SPIKE_MAP = { T: '#fca5a5', X: '#b91c1c' };

// Turret / column cannon — B = muzzle (turns red on warn)
const TURRET = ['.XGGGGX.', 'XGHHHHGX', 'XGHHHHGX', 'XGGGGGGX', '.XMMXM..', '..XBBX..', '..XBBX..', '...XX...'];
const TURRET_MAP = { G: '#475569', H: '#94a3b8', M: '#334155', B: '#64748b', X: '#1e293b' };

// Bouncer enemy (sharp diamond, distinct from the magenta chaser blob)
const BOUNCER_MAP = { o: '#0c2a3a', X: '#22d3ee', H: '#a5f3fc', e: '#0e7490' };
const BOUNCER = [
  '...XX...', '..XHHX..', '.XHXXHX.', 'XHXeeXHX',
  'XHXeeXHX', '.XHXXHX.', '..XHHX..', '...XX...',
];

// Lunger enemy (arrow-like charger)
const LUNGER_MAP = { o: '#3a1a0a', X: '#fb923c', H: '#fed7aa', e: '#7c2d12' };
const LUNGER = [
  '...XX...', '..XHHX..', '.XHHHHX.', 'XHHeeHHX',
  'XHHHHHHX', '.XXHHXX.', '..X..X..', '.X....X.',
];

// Conveyor pad arrow (drawn pointing east at dir 1; rotated per dir in the sprite)
const PAD_MAP = { o: '#1e3a2a', A: '#34d399', H: '#bbf7d0' };
const PAD = [
  '........', '...A....', '...AA...', 'AAAAAAH.',
  'AAAAAAH.', '...AA...', '...A....', '........',
];

// Laser beam emitter (placed cannon that zaps its whole column). 8x8, rows are 8 chars.
const BEAM_MAP = { X: '#0e7490', H: '#67e8f9', e: '#a5f3fc' };
const BEAM = [
  '.XXXXXX.', 'XHHHHHHX', 'XHeeeeHX', 'XHe..eHX',
  'XHe..eHX', 'XHeeeeHX', 'XHHHHHHX', '.XXXXXX.',
];

// Fuse mine (telegraph marker, pulses while armed)
const MINE_MAP = { o: '#3a0a14', X: '#fbbf24', H: '#fde68a', e: '#7c2d12' };
const MINE = [
  '..o..o..', '.oXXXXo.', 'oXHHHHXo', 'oXHeeHXo',
  'oXHeeHXo', 'oXHHHHXo', '.oXXXXo.', '..o..o..',
];

// ─── THE REGISTRY ──────────────────────────────────────────────────────────
const RES = {
  player:  { kind: 'pixel', grid: HERO,    map: HERO_MAP,    px: 2.4, ox: 5.5, oy: 8 },
  drone:   { kind: 'pixel', grid: DRONE,   map: DRONE_MAP,   px: 2.3, ox: 3.5, oy: 3.5 },
  droneFz: { kind: 'pixel', grid: DRONE,   map: DRONE_FZ,    px: 2.3, ox: 3.5, oy: 3.5 },
  star:    { kind: 'pixel', grid: STAR,    map: STAR_MAP,    px: 2.3, warnStroke: true },
  bomb:    { kind: 'pixel', grid: BOMB,    map: BOMB_MAP,    px: 2.3, warnStroke: true },
  tp:      { kind: 'pixel', grid: TP,      map: TP_MAP,      px: 2.3, warnStroke: true },
  hint:    { kind: 'pixel', grid: HINT,    map: HINT_MAP,    px: 2.3, warnStroke: true },
  explode: { kind: 'pixel', grid: EXPLODE, map: EXPLODE_MAP, px: 2.4 },
  portal:  { kind: 'pixel', grid: PORTAL,  map: PORTAL_MAP,  px: 2.4 },
  gem:     { kind: 'pixel', grid: GEM,     map: GEM_MAP,     px: 2.5, warnStroke: true },
  chaser:  { kind: 'pixel', grid: CHASER,  map: CHASER_MAP,  px: 2.5 },
  bouncer: { kind: 'pixel', grid: BOUNCER, map: BOUNCER_MAP, px: 2.5 },
  lunger:  { kind: 'pixel', grid: LUNGER,  map: LUNGER_MAP,  px: 2.5 },
  pad:     { kind: 'pixel', grid: PAD,     map: PAD_MAP,     px: 2.4 },
  mine:    { kind: 'pixel', grid: MINE,    map: MINE_MAP,    px: 2.4, warnStroke: true },
  // crack is vector (drawn in the sprite by broken state)
  crack:   { kind: 'vector' },
  spike:   { kind: 'pixel', grid: SPIKE,   map: SPIKE_MAP,   px: 2.4 },
  turret:  { kind: 'pixel', grid: TURRET,  map: TURRET_MAP,  px: 2.4, warnMap: { B: '#fca5a5' } },
  beam:    { kind: 'pixel', grid: BEAM,     map: BEAM_MAP,    px: 2.3 },
  // wall is vector by default (see note up top); set kind:'image' here to swap it.
  wall:    { kind: 'vector' },
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
