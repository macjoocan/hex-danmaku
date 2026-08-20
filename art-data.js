// scope guard: 이 파일은 일반 <script>라 최상위 const가 전역 렉시컬 바인딩이 된다.
// in-browser Babel이 평가하는 text/babel 스크립트(resources.jsx의 `const { RES }`)와
// 'RES already declared'로 충돌해 리소스 체인 전체가 죽는다 → IIFE로 격리한다.
(function () {
/* ════════════════════════════════════════════════════════════════════════
 *  art-data.js — THE ART REGISTRY (pure data).   ← swap every sprite from this one file
 * ════════════════════════════════════════════════════════════════════════
 *
 *  Every visible thing in the game (player, drone, star, wall, …) is ONE named
 *  entry in the RES table below. Game logic never touches art — so you can
 *  re-skin the whole game here without opening engine.jsx / app.jsx / stages.jsx.
 *  Pure data only (grids/maps/RES) → exposed as window.HXR_DATA. Render logic
 *  (px/drawArt/isImage) lives in resources.jsx.
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

// Explosion burst — radial spikes around a white-hot core (no outline: it's light)
const EXPLODE_MAP = { X: '#ff7a3d', H: '#fff7ed', d: '#c2410c' };
const EXPLODE = [
  '.X.....XX.....X.',
  '..X....XX....X..',
  '...X..dXXd..X...',
  '....XdXXXXdX....',
  '..ddXXXHHXXXdd..',
  '...XXHHHHHHXX...',
  'X.dXHHHHHHHHXd.X',
  'XXXXHHHHHHHHXXXX',
  'XXXXHHHHHHHHXXXX',
  'X.dXHHHHHHHHXd.X',
  '...XXHHHHHHXX...',
  '..ddXXXHHXXXdd..',
  '....XdXXXXdX....',
  '...X..dXXd..X...',
  '..X....XX....X..',
  '.X.....XX.....X.',
];

// Portal / warp gate (stage goal) — double ring with a cyan swirl core
const PORTAL_MAP = {
  o: '#3b0764', X: '#6d28d9', H: '#a78bfa',
  W: '#ede9fe', I: '#22d3ee', d: '#5b21b6',
};
const PORTAL = [
  '....oooooooo....',
  '..ooXXXXXXXXoo..',
  '.oXXHHHHHHHHXXo.',
  '.oXHHWWWWWWHHXo.',
  '.oXHWWddddWWHXo.',
  'oXHWdIIIIIIdWHXo',
  'oXHWdIWWWIIdWHXo',
  'oXHWdIWIIIIdWHXo',
  'oXHWdIIIIIIdWHXo',
  'oXHWdIIIIIIdWHXo',
  '.oXHWWddddWWHXo.',
  '.oXHHWWWWWWHHXo.',
  '.oXXHHHHHHHHXXo.',
  '..ooXXXXXXXXoo..',
  '....oooooooo....',
  '................',
];

// Coin pickup (stage-mode currency) — gold disc with a C engraving
const COIN_MAP = { o: '#7c4a03', X: '#fbbf24', H: '#fde68a', d: '#d97706', e: '#a16207' };
const COIN = [
  '.....oooooo.....',
  '...ooXXXXXXoo...',
  '..oXHHHHHHHHXo..',
  '.oXHHXXXXXXXHXo.',
  '.oXHXXXXXXXXHXo.',
  'oXHXXXeeeeXXXHXo',
  'oXHXXeXXXXXXXHXo',
  'oXHXXeXXXXXXXHXo',
  'oXHXXeXXXXXXXHXo',
  'oXHXXXeeeeXXXHXo',
  '.oXdXXXXXXXXdXo.',
  '.odXXXXXXXXXXdo.',
  '..oddXXXXXXddo..',
  '...ooddddddoo...',
  '.....oooooo.....',
  '................',
];

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

// Spike / hazard (lethal floor) — rocky mound with three spikes, bright tips
const SPIKE_MAP = { o: '#450a0a', X: '#b91c1c', T: '#fca5a5', d: '#7f1d1d' };
const SPIKE = [
  '................',
  '................',
  '................',
  '..TT...TT...TT..',
  '..XX...XX...XX..',
  '..XX...XX...XX..',
  '.dXXd.dXXd.dXXd.',
  '.dXXd.dXXd.dXXd.',
  'oXXXXXXXXXXXXXXo',
  '.oddddddddddddo.',
  '...oooooooooo...',
  '................',
  '................',
  '................',
  '................',
  '................',
];

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
const PAD_MAP = { o: '#052e16', A: '#34d399', H: '#bbf7d0', d: '#059669' };
const PAD = [
  '................',
  '................',
  '................',
  '................',
  '.........oAo....',
  '.........oAAo...',
  '.oooooooooAAAo..',
  '.oAAAAAAAAAAAAo.',
  '.oAHHHHHHHHAAAo.',
  '.oAddddddddAAAo.',
  '.oooooooooAAAo..',
  '.........oAAo...',
  '.........oAo....',
  '................',
  '................',
  '................',
];

// Laser beam emitter (placed cannon that zaps its whole column) —
// teal lens housing with a downward-narrowing muzzle (hints at the column zap).
const BEAM_MAP = {
  o: '#042f3c', X: '#0e7490', H: '#67e8f9', e: '#a5f3fc', d: '#155e75',
};
const BEAM = [
  '..oooooooooooo..',
  '.oXXXXXXXXXXXXo.',
  '.oXHHHHHHHHHHXo.',
  '.oXHddddddddHXo.',
  '.oXHdeeeeeedHXo.',
  '.oXHdeHHHHedHXo.',
  '.oXHdeHeeHedHXo.',
  '.oXHdeHeeHedHXo.',
  '.oXHdeHHHHedHXo.',
  '.oXHdeeeeeedHXo.',
  '.oXHddddddddHXo.',
  '.oXXXXXXXXXXXXo.',
  '..ooXXdHHdXXoo..',
  '....oXdHHdXo....',
  '.....odHHdo.....',
  '......oHHo......',
];

// Fuse mine (telegraph marker, pulses while armed) — spiked yellow shell, dark core
const MINE_MAP = {
  o: '#451a03', X: '#fbbf24', H: '#fde68a', e: '#7c2d12', d: '#d97706',
};
const MINE = [
  '.......oo.......',
  '......oXXo......',
  '......oXXo......',
  '....ooXXXXoo....',
  '...oXXHHHHXXo...',
  '..oXHHXXXXXXXo..',
  '.oXHXXXXXXXXXXo.',
  'ooXXXXeeeeXXXXoo',
  'ooXXXeeHHeeXXXoo',
  '.oXXXXeeeeXXXXo.',
  '.oXdXXXXXXXXdXo.',
  '..oXdXXXXXXdXo..',
  '....ooXXXXoo....',
  '......oXXo......',
  '......oXXo......',
  '.......oo.......',
];

// Boss avatars (24×24 board-top presence; swap via stage def boss.sprite, fallback bossDefault)
const BOSS_DEFAULT_MAP = { o: '#1a1030', X: '#7c3aed', H: '#c4b5fd', d: '#4c1d95', e: '#fde047', m: '#312e81' };
const BOSS_DEFAULT = [
  '........oooooooo........',
  '......ooXXXXXXXXoo......',
  '.....oXXXHHHHHHXXXo.....',
  '....oXXHHXXXXXXHHXXo....',
  '....oXHHXXXXXXXXHHXo....',
  '...oXHXXXmmmmmmXXHXo....',
  '...oXHXmmXXXXXXmmXHXo...',
  '...oXHXmXeeXXeeXmXHXo...',
  '...oXHXmXeeXXeeXmXHXo...',
  '...oXHXmmXXXXXXmmXHXo...',
  '...oXHHXmmmmmmmmXHHXo...',
  '....oXHHXXdddddXXHHo....',
  '....oXXHHXdddddXHHXo....',
  '.....oXXHHXXXXXHHXo.....',
  '......oXXXHHHHHXXXo.....',
  '.......oXXXddddXXo......',
  '........oXXddddXo.......',
  '.........oXddddo........',
  '........odXXXXXdo.......',
  '.......odXXo.oXXdo......',
  '......odXXo...oXXdo.....',
  '.....oXXo.....o.oXXo....',
  '.....oo.........oo......',
  '........................',
];

// Gunner (포격수) — wide cannon mounts on shoulders, angular helmet with forward horns
const BOSS_GUNNER_MAP = { o: '#1a0a00', X: '#b45309', H: '#fde68a', d: '#78350f', e: '#fbbf24', c: '#f97316', s: '#6b7280', g: '#d1d5db' };
const BOSS_GUNNER = [
  '...oo..........oo.......',
  '..oXXo........oXXo......',
  '..oXXo..oooo..oXXo......',
  '..occo.oXXXXo.occo......',
  '...oo.oXHHHHXo.oo.......',
  '.....oXHHHHHHXo.........',
  '....oXHeXXXXeHXo........',
  '....oXHXeeeeXHXo........',
  '....oXHXeeeeXHXo........',
  '....oXHeXXXXeHXo........',
  '....oXHHXeeeXHHo........',
  'osso.oXHHddddHXo.osso...',
  'ogsgo.oXXHHHXXo.ogsgo...',
  'ogsgo..odXXXdo..ogsgo...',
  'ossoo...oXXXo...oossoo..',
  '........oXdXo...........',
  '........odddo...........',
  '.........ooo............',
  '......odXXXXXdo.........',
  '.....odXo...oXdo........',
  '....odXo.....oXdo.......',
  '....oXo.......oXo.......',
  '....oo.........oo.......',
  '........................',
];

// Predator (포식자) — wide fanged mouth, multiple glaring eyes, hunched stalker
const BOSS_PREDATOR_MAP = { o: '#0a1a00', X: '#16a34a', H: '#bbf7d0', d: '#14532d', e: '#fde047', f: '#ef4444', w: '#f0fdf4', t: '#fb923c' };
const BOSS_PREDATOR = [
  '.....oo........oo.......',
  '....oXXo......oXXo......',
  '...oXXXXo....oXXXXo.....',
  '..oXHHXXXo..oXXXHHXo....',
  '..oXHXXXXXooXXXXXHXo....',
  '..oXHXeeXXXXXXeeXHXo....',
  '...oXXXeeXXXXeeXXXo.....',
  '....oXXXXXXXXXXXXo......',
  '...oXHHXXXXXXXXHHXo.....',
  '...oXHHXeeXXeeXHHXo.....',
  '...oXHHXeeXXeeXHHXo.....',
  '...oXHHXXXXXXXHHXo......',
  '....oXXXXXttXXXXXo......',
  '...oXXwXXXttXXXwXXo.....',
  '...oXwwXffffffXwwXo.....',
  '...oXwXffffffXXwXo......',
  '....oXXfffXfffXXo.......',
  '.....oXXXXXXXXXo........',
  '......oXdXXXdXo.........',
  '.......oXdddXo..........',
  '......odXo.oXdo.........',
  '.....odXo...oXdo........',
  '....oXXo.....oXXo.......',
  '........................',
];

// Overlord (군주) — ornate crown, symmetrical regal face, robes
const BOSS_OVERLORD_MAP = { o: '#1a0a14', X: '#be123c', H: '#fda4af', e: '#fde047', c: '#fbbf24', g: '#f9a8d4', r: '#fecdd3' };
const BOSS_OVERLORD = [
  '.....o.oooooo.o.........',
  '.....ocXXccXXco.........',
  '.....ocXcXXcXco.........',
  '......occXXcco..........',
  '.....oXXXXXXXXXo........',
  '....oXXHHHHHHXXXo.......',
  '...oXHHgggggggHHXo......',
  '...oXHgXXXXXXXgHXo......',
  '...oXHgXeeXXeeXgXo......',
  '...oXHgXeeXXeeXgXo......',
  '...oXHgXXXXXXXgHXo......',
  '...oXHHgXrrrXgHHXo......',
  '....oXHHXrrrXHHXo.......',
  '....oXXHHXeXHHXXo.......',
  '.....oXXHHHHHXXo........',
  '......oXXXcXXXo.........',
  '.......oXXcXXo..........',
  '......oXXXcXXXo.........',
  '.....oXXo...oXXo........',
  '....oXXo.....oXXo.......',
  '...oXXo.......oXXo......',
  '..oXXo.........oXXo.....',
  '..oo.............oo.....',
  '........................',
];

// Boss bomb zone (temporary instant-death tile) — armed look; telegraph rendered via warnStroke
const BOMBZONE_MAP = { o: '#450a0a', X: '#dc2626', H: '#fca5a5', d: '#7f1d1d', e: '#fef2f2' };
const BOMBZONE = [
  '................',
  '..XX........XX..',
  '.oXXo......oXXo.',
  '..oXXo....oXXo..',
  '...oXXo..oXXo...',
  '....oXXddXXo....',
  '.....oXHHXo.....',
  '....oXHeeHXo....',
  '....oXHeeHXo....',
  '.....oXHHXo.....',
  '....oXXddXXo....',
  '...oXXo..oXXo...',
  '..oXXo....oXXo..',
  '.oXXo......oXXo.',
  '..XX........XX..',
  '................',
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
  explode: { kind: 'pixel', grid: EXPLODE, map: EXPLODE_MAP, px: 1.7 },
  portal:  { kind: 'pixel', grid: PORTAL,  map: PORTAL_MAP,  px: 1.7 },
  gem:     { kind: 'pixel', grid: GEM,     map: GEM_MAP,     px: 1.5, warnStroke: true },
  coin:    { kind: 'pixel', grid: COIN,    map: COIN_MAP,    px: 1.3, warnStroke: true },
  chaser:  { kind: 'pixel', grid: CHASER,  map: CHASER_MAP,  px: 1.5 },
  bouncer: { kind: 'pixel', grid: BOUNCER, map: BOUNCER_MAP, px: 1.5 },
  lunger:  { kind: 'pixel', grid: LUNGER,  map: LUNGER_MAP,  px: 1.5 },
  pad:     { kind: 'pixel', grid: PAD,     map: PAD_MAP,     px: 1.5 },
  mine:    { kind: 'pixel', grid: MINE,    map: MINE_MAP,    px: 1.5, warnStroke: true },
  bombZone: { kind: 'pixel', grid: BOMBZONE, map: BOMBZONE_MAP, px: 1.5, warnStroke: true },
  // crack is vector (drawn in the sprite by broken state)
  crack:   { kind: 'vector' },
  spike:   { kind: 'pixel', grid: SPIKE,   map: SPIKE_MAP,   px: 1.5 },
  turret:  { kind: 'pixel', grid: TURRET,  map: TURRET_MAP,  px: 1.5, warnMap: { B: '#fca5a5' } },
  beam:    { kind: 'pixel', grid: BEAM,     map: BEAM_MAP,    px: 1.5 },
  // wall is vector by default (see note up top); set kind:'image' here to swap it.
  wall:    { kind: 'vector' },
  bossDefault:  { kind: 'pixel', grid: BOSS_DEFAULT,  map: BOSS_DEFAULT_MAP,  px: 1.6 },
  bossGunner:   { kind: 'pixel', grid: BOSS_GUNNER,   map: BOSS_GUNNER_MAP,   px: 1.6 },
  bossPredator: { kind: 'pixel', grid: BOSS_PREDATOR, map: BOSS_PREDATOR_MAP, px: 1.6 },
  bossOverlord: { kind: 'pixel', grid: BOSS_OVERLORD, map: BOSS_OVERLORD_MAP, px: 1.6 },
};

// 데이터/로직 분리: 렌더 로직(px/drawArt/isImage)은 resources.jsx에 있음. 여기는 순수 데이터.
window.HXR_DATA = { RES };

})();
