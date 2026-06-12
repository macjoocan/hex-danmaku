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

// Hero (humanoid player) — 16×20 chibi: head ≈ half the body, big eyes, blush
const HERO_MAP = {
  o: '#0a1f38',                               // outline
  H: '#ef8a3a', h: '#fcd34d',                 // hair, hair highlight
  k: '#f7c89a', j: '#d29a6b',                 // skin, skin shadow
  r: '#f4a9b8',                               // cheek blush
  e: '#0a1f38',                               // eyes
  T: '#38bdf8', t: '#cdeafe', u: '#0c4a6e',   // tunic, hi, shadow
  P: '#2563eb', p: '#1e3a8a',                 // cape, cape shadow
  b: '#fbbf24',                               // belt
  G: '#27407a',                               // pants
  B: '#0b1830',                               // boots
};
const HERO = [
  '.....oooooo.....',
  '...ooHHHHHHoo...',
  '..oHHhhhhhhHHo..',
  '.oHHhhhhhhhhHHo.',
  '.oHhhhhhhhhhhHo.',
  'oHHhhhhhhhhhhHHo',
  'oHHkkkkkkkkkkHHo',
  'oHkkkkkkkkkkkkHo',
  'oHkkeekkkkeekkHo',
  'oHkkeekkkkeekkHo',
  '.okkrkkkkkkrkko.',
  '.ookkkjjjjkkkoo.',
  '..ooojjjjjjooo..',
  '.PPooTTTTTTooPP.',
  'oPPoTTtTTTTuoPPo',
  'oPpoTtTTTTTuoPpo',
  'oPpoTTTTTTTuoPpo',
  '.ooobbbbbbbooo..',
  '..oGGGGGGGGGGo..',
  '.oBBBoo..ooBBBo.',
];

// Drone (enemy "bullet") — round body, visor eyes; normal + frozen palettes
const DRONE_MAP = {
  o: '#4a0d18',                    // outline (deep wine)
  R: '#fb7185', r: '#fda4af',      // body, highlight
  d: '#be123c',                    // shade
  E: '#fff1f2', e: '#1f0a0e',      // visor, pupils
  w: '#e11d48',                    // accent fins
};
const DRONE_FZ = {
  o: '#0f2f52', R: '#93c5fd', r: '#dbeafe',
  d: '#2563eb', E: '#eff6ff', e: '#0a1a33', w: '#3b82f6',
};
const DRONE = [
  '......oooo......',
  '....oorrrroo....',
  '...orrrRRrrro...',
  '..orRRRRRRRRro..',
  '.orRRRRRRRRRRro.',
  'owRREEEEEEEERRwo',
  'owRREeeEEeeERRwo',
  'oRRREEEEEEEERRRo',
  'oRRRRRRRRRRRRRRo',
  'oRRRRRRRRRRRRRRo',
  '.odRRdddddddRdo.',
  '.oddRRRRRRRRddo.',
  '..oddddddddddo..',
  '...od......do...',
  '....o......o....',
  '................',
];

// Score star — 5-point star with top-left gloss
const STAR_MAP = { o: '#7c4a03', X: '#fbbf24', H: '#fde68a', d: '#d97706' };
const STAR = [
  '.......oo.......',
  '......oXXo......',
  '......oXXo......',
  '.....oXHHXo.....',
  '.....oXHHXo.....',
  'ooooooXHHXoooooo',
  'oXXXXXHHHHXXXXXo',
  '.oXXHHHHHHHHXXo.',
  '..oXXHHHHHHXXo..',
  '...oXXHHHHXXo...',
  '...oXXXXXXXXo...',
  '..oXXXXddXXXXo..',
  '..oXXdo..odXXo..',
  '.oXdo......odXo.',
  '.oo..........oo.',
  '................',
];

// Bomb pickup — round green bomb, lit fuse top-right
const BOMB_MAP = {
  o: '#064e3b', X: '#34d399', H: '#a7f3d0', d: '#059669',
  F: '#fbbf24', f: '#f97316',
};
const BOMB = [
  '..........ff....',
  '.........fFFf...',
  '..........oo....',
  '.....ooooooo....',
  '...ooXXXXXXoo...',
  '..oXXHHXXXXXXo..',
  '.oXHHHHXXXXXXXo.',
  '.oXHHXXXXXXXXXo.',
  'oXXHXXXXXXXXXXXo',
  'oXXXXXXXXXXXXXXo',
  'oXXXXXXXXXXXXXXo',
  'oXdXXXXXXXXXXdXo',
  '.odXXXXXXXXXXdo.',
  '.oddXXXXXXXXddo.',
  '..oddddddddddo..',
  '...oooooooooo...',
];

// Warp / teleport pickup — purple ring with a small core
const TP_MAP = { o: '#4c1d95', X: '#c084fc', H: '#ede9fe', d: '#7e22ce' };
const TP = [
  '................',
  '.....oooooo.....',
  '...ooXXXXXXoo...',
  '..oXXHHHHHHXXo..',
  '.oXXHooooooHXXo.',
  '.oXHo..dd..oHXo.',
  'oXHo..dXXd..oHXo',
  'oXHo.dXHHXd.oHXo',
  'oXHo.dXHHXd.oHXo',
  'oXHo..dXXd..oHXo',
  '.oXHo..dd..oHXo.',
  '.oXXHooooooHXXo.',
  '..oXXHHHHHHXXo..',
  '...ooXXXXXXoo...',
  '.....oooooo.....',
  '................',
];

// Foresight (hint) pickup — all-seeing eye lens
const HINT_MAP = {
  o: '#431407', W: '#fff7ed', I: '#f97316', P: '#1c1917', d: '#c2410c',
};
const HINT = [
  '................',
  '......oooo......',
  '....ooddddoo....',
  '..oodWWWWWWdoo..',
  '.odWWWWWWWWWWdo.',
  'odWWWWIIIIWWWWdo',
  'odWWWIIIIIIWWWdo',
  'odWWIIWPPPIIWWdo',
  'odWWIIPPPPIIWWdo',
  'odWWWIIIIIIWWWdo',
  'odWWWWIIIIWWWWdo',
  '.odWWWWWWWWWWdo.',
  '..oodWWWWWWdoo..',
  '....ooddddoo....',
  '......oooo......',
  '................',
];

// Explosion burst
const EXPLODE = ['X.X..X.X', '.XX..XX.', 'XXXXXXXX', '..XHHX..', '..XHHX..', 'XXXXXXXX', '.XX..XX.', 'X.X..X.X'];
const EXPLODE_MAP = { X: '#ff7a3d', H: '#fff7ed' };

// Portal / warp gate (stage goal)
const PORTAL = ['.XXXXXX.', 'XHHHHHHX', 'XHWWWWHX', 'XHWIIWHX', 'XHWIIWHX', 'XHWWWWHX', 'XHHHHHHX', '.XXXXXX.'];
const PORTAL_MAP = { X: '#6d28d9', H: '#a78bfa', W: '#e9d5ff', I: '#22d3ee' };

// Required gem (collect stages) — faceted cut stone, distinct octagon silhouette vs the star
const GEM_MAP = { o: '#854d0e', X: '#fbbf24', H: '#fffbeb', d: '#ca8a04' };
const GEM = [
  '................',
  '................',
  '....oooooooo....',
  '...oXHHHHHHXo...',
  '..oXHHXXXXHHXo..',
  '.oXXXXXXXXXXXXo.',
  '.oXXXXXXXXXXXXo.',
  '.oXdXXdXXdXXdXo.',
  '..odXXXXXXXXdo..',
  '...odXXXXXXdo...',
  '....odXXXXdo....',
  '.....odXXdo.....',
  '......odXo......',
  '.......oo.......',
  '................',
  '................',
];

// Chaser enemy — angry magenta blob: V-brows, teeth, dripping base
const CHASER_MAP = {
  o: '#4a1052',                    // outline
  X: '#c026d3', H: '#f0abfc',      // body, highlight
  d: '#86198f',                    // shade
  W: '#fdf4ff', e: '#2e0a33',      // eye white / teeth, pupils+brows
};
const CHASER = [
  '.....oooooo.....',
  '...ooXXXXXXoo...',
  '..oXXHHXXXXXXo..',
  '.oXHHXXXXXXXXXo.',
  '.oXXeXXXXXXeXXo.',
  'oXXXeeXXXXeeXXXo',
  'oXXWWeeXXeeWWXXo',
  'oXXWWeeXXeeWWXXo',
  'oXXXXXXXXXXXXXXo',
  'oXXWWXXWWXXWWXXo',
  'oXdXXXXXXXXXXdXo',
  '.odXXXXXXXXXXdo.',
  '.oddXXXXXXXXddo.',
  '.oddXddXXddXddo.',
  '..oo.oo..oo.oo..',
  '................',
];

// Spike / hazard (lethal floor) — T = bright tip, X = base
const SPIKE = ['........', '.T..T..T', '.TT.TT.T', 'XXXXXXXX', '.XXXXXX.', '..XXXX..', '...XX...', '........'];
const SPIKE_MAP = { T: '#fca5a5', X: '#b91c1c' };

// Turret / column cannon — steel housing, barrel pointing down. B = muzzle (turns red on warn)
const TURRET_MAP = {
  o: '#0f172a',                    // outline
  G: '#64748b', H: '#cbd5e1',      // steel, highlight
  M: '#334155',                    // dark inset
  B: '#94a3b8',                    // muzzle (warn → red)
};
const TURRET = [
  '..oooooooooooo..',
  '.oGGGGGGGGGGGGo.',
  '.oGHHHHHHHHHHGo.',
  '.oGHHGGGGGGHHGo.',
  '.oGHGGGGGGGGHGo.',
  '.oGGGMMMMMMGGGo.',
  '.oGGMMMMMMMMGGo.',
  '..oGGGMMMMGGGo..',
  '...ooGMMMMGoo...',
  '....oMBBBBMo....',
  '....oMBBBBMo....',
  '....oMBBBBMo....',
  '.....oBBBBo.....',
  '.....oBBBBo.....',
  '......oooo......',
  '................',
];

// Bouncer enemy — cyan diamond with a dark core + deadpan eyes
const BOUNCER_MAP = {
  o: '#0c2f3f',                    // outline
  X: '#22d3ee', H: '#a5f3fc',      // facet, highlight
  d: '#0e7490',                    // core shade
  W: '#ecfeff', e: '#083344',      // eye white, pupils
};
const BOUNCER = [
  '.......oo.......',
  '......oXXo......',
  '.....oXHHXo.....',
  '....oXHHHHXo....',
  '...oXHHXXHHXo...',
  '..oXHHXddXHHXo..',
  '.oXHHXddddXHHXo.',
  'oXHHXWeddeWXHHXo',
  'oXHHXWWddWWXHHXo',
  '.oXHHXddddXHHXo.',
  '..oXHHXddXHHXo..',
  '...oXHHXXHHXo...',
  '....oXHHHHXo....',
  '.....oXHHXo.....',
  '......oXXo......',
  '.......oo.......',
];

// Lunger enemy — orange arrowhead charger with glaring eyes
const LUNGER_MAP = {
  o: '#431407',                    // outline
  X: '#fb923c', H: '#fed7aa',      // body, highlight
  d: '#c2410c',                    // shade
  W: '#fff7ed', e: '#27100a',      // eye white, pupils
};
const LUNGER = [
  '.......oo.......',
  '......oXXo......',
  '.....oXHHXo.....',
  '....oXHHHHXo....',
  '...oXHHHHHHXo...',
  '..oXHeHHHHeHXo..',
  '.oXHWeeHHeeWHXo.',
  'oXHHWWeHHeWWHHXo',
  'oXHHHHHHHHHHHHXo',
  'oXXHHHHHHHHHHXXo',
  '.oXXHHHddHHHXXo.',
  '..oXXHHddHHXXo..',
  '...oXXdddddXo...',
  '..oXXo.oo.oXXo..',
  '..oXo......oXo..',
  '..o..........o..',
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
  player:  { kind: 'pixel', grid: HERO,    map: HERO_MAP,    px: 1.6, ox: 8, oy: 11 },
  drone:   { kind: 'pixel', grid: DRONE,   map: DRONE_MAP,   px: 1.5 },
  droneFz: { kind: 'pixel', grid: DRONE,   map: DRONE_FZ,    px: 1.5 },
  star:    { kind: 'pixel', grid: STAR,    map: STAR_MAP,    px: 1.5, warnStroke: true },
  bomb:    { kind: 'pixel', grid: BOMB,    map: BOMB_MAP,    px: 1.5, warnStroke: true },
  tp:      { kind: 'pixel', grid: TP,      map: TP_MAP,      px: 1.5, warnStroke: true },
  hint:    { kind: 'pixel', grid: HINT,    map: HINT_MAP,    px: 1.5, warnStroke: true },
  explode: { kind: 'pixel', grid: EXPLODE, map: EXPLODE_MAP, px: 2.4 },
  portal:  { kind: 'pixel', grid: PORTAL,  map: PORTAL_MAP,  px: 2.4 },
  gem:     { kind: 'pixel', grid: GEM,     map: GEM_MAP,     px: 1.5, warnStroke: true },
  chaser:  { kind: 'pixel', grid: CHASER,  map: CHASER_MAP,  px: 1.5 },
  bouncer: { kind: 'pixel', grid: BOUNCER, map: BOUNCER_MAP, px: 1.5 },
  lunger:  { kind: 'pixel', grid: LUNGER,  map: LUNGER_MAP,  px: 1.5 },
  pad:     { kind: 'pixel', grid: PAD,     map: PAD_MAP,     px: 2.4 },
  mine:    { kind: 'pixel', grid: MINE,    map: MINE_MAP,    px: 2.4, warnStroke: true },
  // crack is vector (drawn in the sprite by broken state)
  crack:   { kind: 'vector' },
  spike:   { kind: 'pixel', grid: SPIKE,   map: SPIKE_MAP,   px: 2.4 },
  turret:  { kind: 'pixel', grid: TURRET,  map: TURRET_MAP,  px: 1.5, warnMap: { B: '#fca5a5' } },
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
