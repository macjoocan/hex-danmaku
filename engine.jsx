/* engine.jsx — core grid + unified game logic for Hex Danmaku
 * Supports endless mode AND stage mode (normal / survive / collect / boss).
 * Stage data + pattern selection live in stages.jsx (window.HXS).
 */

// ─── Grid constants ────────────────────────────────────────────
const C = 7;
const R = 11;
const SZ = 23;                          // hex radius (center → vertex)
const W = Math.sqrt(3) * SZ;            // hex width
const RH = SZ * 1.5;                    // row height
const PD = 8;                           // svg padding

const SW = Math.ceil(PD * 2 + SZ * 2 + W * (C - 1) + W * 0.5);
const SH = Math.ceil(PD * 2 + SZ * 2 + RH * (R - 1));

// hex center → svg coord
const hc = (r, c) => ({
  x: PD + SZ + W * c + W * 0.5 * (r % 2),
  y: PD + SZ + RH * r,
});

// pointy-top hex svg path
const hp = (cx, cy, s = SZ - 1.2) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (i * Math.PI) / 3 - Math.PI / 6;
    return `${i ? 'L' : 'M'}${(cx + s * Math.cos(a)).toFixed(2)},${(cy + s * Math.sin(a)).toFixed(2)}`;
  }).join('') + 'Z';

// odd-r offset neighbors
const DE = [[0,-1],[0,1],[-1,-1],[-1,0],[1,-1],[1,0]];
const DO = [[0,-1],[0,1],[-1, 0],[-1,1],[1, 0],[1,1]];
const D = r => (r % 2 ? DO : DE);

// hex distance via cube coords
const hd = (r1, c1, r2, c2) => {
  const ax = c1 - (r1 - (r1 & 1)) / 2, az = r1, ay = -ax - az;
  const bx = c2 - (r2 - (r2 & 1)) / 2, bz = r2, by = -bx - bz;
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
};

// ─── Balance config (editor-tunable via window.HXB; defaults match originals) ───
const DEFAULT_BAL = {
  skill: { undoCost: 30, bombCost: 50, bombRadius: 2, freezeCost: 80, freezeTurns: 3,
           undoCoin: 20, bombCoin: 30, freezeCoin: 40, usesPerRun: 2 },
  score: { surviveBase: 10, comboCap: 10, gemBase: 80, gemCombo: 4, starBase: 50, starCombo: 3 },
  item:  { spawnChance: 0.24, max: 3, pSc: 0.45, pBm: 0.18, pTp: 0.12 }, // ht = remainder
  enemy: { chaseEvery: 2, lungeWindup: 1, lungeDash: 2 },
  endless: { diffEasy: 15, diffNormal: 35, diffHard: 60 },
  coin: { clearPerStar: 20, repeatPerStar: 5, pickupValue: 5, spawnChance: 0.08, max: 2 },
  boss: {
    bombsPerWave: 2, bombLife: 2, bombTelegraph: 1,
    blast: 1,        // 폭탄 폭발 반경(헥스 거리) <추정>
    blinkEvery: 3,   // N웨이브마다 보스 순간이동 (1웨이브 전 착지점 예고) <추정>
    blinkShots: 4,   // 순간이동 직후 착지점에서 뿌리는 자유탄 수 <추정>
  },
  // 액티브 기믹 (엔드리스 전용 · 기획: docs/design-active-growth-roguelike.md 1차 세트)
  // 초판 수치는 <추정> — endless-sim으로 검증 후 확정
  graze: { gaugePerBullet: 1, gaugeMax: 6, scoreBonus: 5 },
  dash: { cost: 3, range: 2 },
  // 메타 성장 (2차 세트 B1·C3): 사망 시 점수→코인 전환율. <추정> — meta-econ-sim으로 확정
  meta: { convertBase: 0.03, convertPerLv: 0.02 },
  // 변칙 탄막 (엔드리스 전용): diffEasy 턴부터 지그재그·드리프트, diffNormal 턴부터 슬로우 혼입. <추정>
  bullets: { zigChance: 0.2, slowChance: 0.15, driftChance: 0.12 },
  // 자유탄(보스 전용): 셀 격자를 무시하고 곡선으로 흘러내리는 실제 위험 탄. <추정>
  // 웨이브당 최대 2발, 턴당 진행 보폭 = stepMin + rnd()*stepVar (탄마다 랜덤·시드 결정론)
  freeBullets: { maxPerWave: 2, stepMin: 0.14, stepVar: 0.2, swayPx: 70, cap: 12 },
};
const bal = () => (typeof window !== 'undefined' && window.HXB) ? window.HXB : DEFAULT_BAL;

// ─── 영구 업그레이드 (엔드리스 전용 · 2차 세트 B1) ─────────────
// 전부 엔드리스에만 작용 — 스테이지 밸런스는 건드리지 않는다(① 결정).
// 가격은 <추정> 초판 — meta-econ-sim으로 완주 런 수를 검증해 확정.
const UPGRADES = {
  startGauge: { name: '예열',       max: 2, cost: [200, 600],  desc: '시작 게이지 +2' },
  grazeBonus: { name: '아슬아슬',   max: 2, cost: [250, 750],  desc: '그레이즈 점수 +5' },
  gaugeCap:   { name: '게이지 확장', max: 2, cost: [300, 900],  desc: '게이지 상한 +1' },
  convert:    { name: '전리품',     max: 2, cost: [400, 1200], desc: '사망 시 점수→코인 전환율 +2%p' },
  dashCost:   { name: '경량 도약',   max: 1, cost: [800],       desc: '대시 비용 -1' },
};
const loadUp = () => { try { return JSON.parse(localStorage.getItem('hex_up') || '{}'); } catch { return {}; } };
const saveUp = (u) => { try { localStorage.setItem('hex_up', JSON.stringify(u)); } catch {} return u; };
const upLv = (s, k) => Math.min((s && s.up && s.up[k]) || 0, UPGRADES[k].max);
// 업그레이드 반영 유효값 — tick과 UI가 같은 함수를 쓴다(드리프트 방지)
const effDashCost = (s) => Math.max(1, bal().dash.cost - upLv(s, 'dashCost'));
const effGaugeMax = (s) => bal().graze.gaugeMax + upLv(s, 'gaugeCap');
const effGrazeBonus = (s) => bal().graze.scoreBonus + 5 * upLv(s, 'grazeBonus');
const effConvertRate = (s) => bal().meta.convertBase + bal().meta.convertPerLv * upLv(s, 'convert');

// ─── Patterns (column-spawn shapes) ────────────────────────────
const PAT = {
  twin:    { n: '양날',     c: [0, 1, 5, 6] },
  rwall:   { n: '우측 벽',   c: [4, 5, 6] },
  lwall:   { n: '좌측 벽',   c: [0, 1, 2] },
  center:  { n: '중앙 압박', c: [2, 3, 4] },
  diag:    { n: '사선',     c: [0, 2, 4, 6] },
  rdiag:   { n: '역사선',   c: [1, 3, 5] },
  vshape:  { n: 'V자',      c: [0, 1, 2, 5, 6] },
  ivshape: { n: '역V자',    c: [2, 3, 4, 5, 6] },
  focus:   { n: '집중 포화', c: [1, 2, 3, 4, 5] },
  barrage: { n: '폭격',     c: [0, 1, 2, 4, 5, 6] },
  single:  { n: '저격',     c: [3] },
  edges:   { n: '양끝',     c: [0, 6] },
  gapL:    { n: '좁은 틈',   c: [0, 1, 2, 3, 4, 5] },
  gapR:    { n: '좁은 틈',   c: [1, 2, 3, 4, 5, 6] },
  comb:    { n: '빗살',     c: [0, 2, 4, 6] },
};

// legacy pools used by endless mode
const EP = [PAT.twin, PAT.rwall, PAT.lwall, PAT.center, PAT.diag, PAT.rdiag];
const HP = [PAT.vshape, PAT.ivshape, PAT.focus, PAT.barrage];

// ─── injectable RNG (daily challenge uses a date seed; default = global Math.random) ───
const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
let _rng = null;
const seedRng = (seed) => { _rng = (seed != null) ? mulberry32(seed >>> 0) : null; };
const rnd = () => (_rng || Math.random)();

const rp = (t) => {
  const pool =
    t < 15 ? EP :
    t < 35 ? (rnd() < 0.30 ? HP : EP) :
    t < 55 ? (rnd() < 0.55 ? HP : EP) :
             (rnd() < 0.75 ? HP : EP);
  return pool[Math.floor(rnd() * pool.length)];
};

// difficulty label (endless)
const DL = (t) => {
  const e = bal().endless;
  return t < e.diffEasy   ? { lb: 'EASY',   sub: '초급',  c: '#5eead4' } :
         t < e.diffNormal ? { lb: 'NORMAL', sub: '중급',  c: '#fbbf24' } :
         t < e.diffHard   ? { lb: 'HARD',   sub: '고급',  c: '#fb7185' } :
                            { lb: 'CHAOS',  sub: '극한',  c: '#f43f5e' };
};

// ─── Helpers ───────────────────────────────────────────────────
const safest = (bl, pl, walls = []) => {
  let best = null, bestD = -1;
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (bl.some(b => b.r === r && b.c === c)) continue;
      if (walls.some(w => w.r === r && w.c === c)) continue;
      let minD = 99;
      for (const b of bl) {
        const d = hd(r, c, b.r, b.c);
        if (d < minD) minD = d;
      }
      const playerD = pl ? hd(r, c, pl.r, pl.c) : 0;
      const score = minD * 10 + Math.min(playerD, 3);
      if (score > bestD) { bestD = score; best = { r, c }; }
    }
  }
  return best;
};

const tryItem = (its, pl, bl) => {
  if (its.length >= bal().item.max) return its;
  if (rnd() > bal().item.spawnChance) return its;
  const occ = new Set([
    ...bl.map(b => `${b.r},${b.c}`),
    `${pl.r},${pl.c}`,
    ...its.map(i => `${i.r},${i.c}`),
  ]);
  const cands = [];
  for (let r = 1; r < R - 1; r++) {
    for (let c = 0; c < C; c++) {
      if (!occ.has(`${r},${c}`)) cands.push({ r, c });
    }
  }
  if (!cands.length) return its;
  const cell = cands[Math.floor(rnd() * cands.length)];
  const roll = rnd();
  const it = bal().item;
  const ty = roll < it.pSc ? 'sc'
           : roll < it.pSc + it.pBm ? 'bm'
           : roll < it.pSc + it.pBm + it.pTp ? 'tp'
           : 'ht';
  return [...its, { ...cell, ty }];
};

// stage-only coin drop — separate from tryItem so the endless pickup pool
// (and stage balance) stays untouched; cn is non-lethal so fairness is unaffected.
const tryCoin = (its, pl, bl, blocked = []) => {
  const cb = bal().coin;
  if (its.filter(i => i.ty === 'cn').length >= cb.max) return its;
  if (rnd() > cb.spawnChance) return its;
  const occ = new Set([
    ...bl.map(b => `${b.r},${b.c}`),
    ...blocked.map(o => `${o.r},${o.c}`),
    `${pl.r},${pl.c}`,
    ...its.map(i => `${i.r},${i.c}`),
  ]);
  const cands = [];
  for (let r = 1; r < R - 1; r++) {
    for (let c = 0; c < C; c++) {
      if (!occ.has(`${r},${c}`)) cands.push({ r, c });
    }
  }
  if (!cands.length) return its;
  const cell = cands[Math.floor(rnd() * cands.length)];
  return [...its, { ...cell, ty: 'cn' }];
};

// move one enemy one hex step toward target (greedy, avoids walls + each other)
const stepToward = (e, target, walls, others) => {
  const opts = [[0, 0], ...D(e.r)];
  let best = { r: e.r, c: e.c }, bd = hd(e.r, e.c, target.r, target.c);
  for (const [dr, dc] of opts) {
    if (dr === 0 && dc === 0) continue;
    const r = e.r + dr, c = e.c + dc;
    if (r < 0 || r >= R || c < 0 || c >= C) continue;
    if (walls.some(w => w.r === r && w.c === c)) continue;
    if (others.some(o => o.r === r && o.c === c)) continue;
    const d = hd(r, c, target.r, target.c);
    if (d < bd) { bd = d; best = { r, c }; }
  }
  return best;
};

// direction index opposites: [W,E,NW,NE,SW,SE] -> reflect
const REFLECT = [1, 0, 5, 4, 3, 2];

// pick the neighbor-direction index that most reduces distance to the player
const pickFace = (e, ctx) => {
  const dirs = D(e.r);
  let best = 1, bd = 999;
  for (let i = 0; i < dirs.length; i++) {
    const r = e.r + dirs[i][0], c = e.c + dirs[i][1];
    if (r < 0 || r >= R || c < 0 || c >= C) continue;
    const d = hd(r, c, ctx.player.r, ctx.player.c);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
};

const ENEMY_KINDS = {
  // half-speed greedy homing (existing behavior)
  chase: {
    step: (e, ctx) => {
      const every = bal().enemy.chaseEvery;
      if (ctx.t % every !== every - 1) return;
      const p = stepToward(e, ctx.player, ctx.block, ctx.others);
      e.r = p.r; e.c = p.c;
    },
  },
  // constant-direction straight line, reflects off walls/edges
  bounce: {
    step: (e, ctx) => {
      if (e.dir == null) e.dir = 1; // default east
      const tryMove = (dir) => {
        const [dr, dc] = D(e.r)[dir];
        const r = e.r + dr, c = e.c + dc;
        const blocked = r < 0 || r >= R || c < 0 || c >= C
          || ctx.block.some(w => w.r === r && w.c === c)
          || ctx.others.some(o => o.r === r && o.c === c);
        return blocked ? null : { r, c };
      };
      let nxt = tryMove(e.dir);
      if (!nxt) { e.dir = REFLECT[e.dir]; nxt = tryMove(e.dir); }
      if (nxt) { e.r = nxt.r; e.c = nxt.c; }
    },
  },
  // wind up (telegraph) then dash several hexes toward the player
  lunge: {
    step: (e, ctx) => {
      const wind = bal().enemy.lungeWindup, dash = bal().enemy.lungeDash;
      if (e.cd == null) e.cd = wind;
      if (e.cd > 0) { e.cd -= 1; e.face = pickFace(e, ctx); return; }
      if (e.face == null) e.face = pickFace(e, ctx); // windup 0: no telegraph turn ran, aim now
      for (let i = 0; i < dash; i++) {
        const [dr, dc] = D(e.r)[e.face];
        const r = e.r + dr, c = e.c + dc;
        if (r < 0 || r >= R || c < 0 || c >= C
          || ctx.block.some(w => w.r === r && w.c === c)) break;
        e.r = r; e.c = c;
        ctx.passed.push({ r, c }); // mid-dash cells are lethal too
      }
      e.cd = wind;
    },
    // cells the dash will sweep next turn (for the renderer warning lane)
    telegraph: (e) => {
      if (e.cd !== 0 || e.face == null) return [];
      const dash = bal().enemy.lungeDash;
      const cells = []; let r = e.r, c = e.c;
      for (let i = 0; i < dash; i++) {
        const [dr, dc] = D(r)[e.face]; r += dr; c += dc;
        if (r < 0 || r >= R || c < 0 || c >= C) break;
        cells.push({ r, c });
      }
      return cells;
    },
  },
};

// declarative terrain/hazard properties (metadata; crack/pad use the inline logic in tick)
const GIMMICKS = {
  wall:   { blocksMove: true,  blocksBullet: true,  lethal: false },
  turret: { blocksMove: true,  blocksBullet: true,  lethal: false },
  spike:  { blocksMove: false, blocksBullet: false, lethal: true },
  crack:  { blocksMove: 'whenBroken', blocksBullet: 'whenBroken', lethal: false },
  pad:    { blocksMove: false, blocksBullet: false, lethal: false, push: true },
  beam:   { blocksMove: false, blocksBullet: false, lethal: 'whenFiring' },
};

// ─── 자유탄(보스 전용) — 픽셀 베지어 궤적을 따라 턴 동기로 전진하는 실탄 ───
// 충돌은 "현재 궤적 위치가 속한 셀 == 플레이어 셀". tick과 UI가 같은 함수를 쓴다.
const bez1 = (a, b, c2, d, t) => {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c2 + t * t * t * d;
};
const fbPoint = (f, p) => ({
  x: bez1(f.x0, f.cx1, f.cx2, f.x1, p),
  y: bez1(f.y0, f.cy1, f.cy2, f.y1, p),
});
// 픽셀 → 셀 (hc의 역함수 근사)
const fbCellAt = (x, y) => {
  const r = Math.round((y - PD - SZ) / RH);
  const c = Math.round((x - PD - SZ - W * 0.5 * (((r % 2) + 2) % 2)) / W);
  return { r, c };
};
const fbCell = (f, p) => { const pt = fbPoint(f, p == null ? f.p : p); return fbCellAt(pt.x, pt.y); };

// ─── 탄 이동 예측 (tick과 UI 예지 프리뷰가 같은 함수를 쓴다 — 유효값 함수 원칙) ───
// zig: 매 턴 좌우를 번갈아 대각선으로 내려온다(모서리에서 반사). slow: 두 턴에 한 칸(held 토글).
const nextBulletPos = (b) => {
  if (b.fuse != null) return { r: b.r, c: b.c, vc: 0 };
  if (b.slow && !b.held) return { r: b.r, c: b.c, vc: 0, hold: true };
  let vc = b.zig ? (b.zdir || 1) : (b.vc || 0);
  let nc = b.c + vc;
  if ((b.bounce || b.zig) && (nc < 0 || nc >= C)) { vc = -vc; nc = b.c + vc; }
  return { r: b.r + 1, c: nc, vc };
};

// ─── Main tick (handles both modes) ────────────────────────────
const tick = (s, nr, nc) => {
  if (s.ov || s.win) return s;

  const stay = nr === s.pl.r && nc === s.pl.c;
  const isNeighbor = D(s.pl.r).some(([dr, dc]) => s.pl.r + dr === nr && s.pl.c + dc === nc);
  // dash (엔드리스 전용): 그레이즈 게이지를 소모해 2칸 도약. 경로는 검사하지 않는다(점프) —
  // 착지 칸의 충돌 판정은 일반 이동과 동일하게 아래에서 이뤄진다.
  const dashCost = effDashCost(s);
  const isDash = !stay && !isNeighbor && s.mode !== 'stage'
    && hd(s.pl.r, s.pl.c, nr, nc) === bal().dash.range && (s.gz || 0) >= dashCost;
  if (!stay && !isNeighbor && !isDash) return s;
  if (nr < 0 || nr >= R || nc < 0 || nc >= C) return s;

  const walls = s.walls || [];
  const turrets = s.turrets || [];
  const spikes = s.spikes || [];
  const cracks = s.cracks || [];
  const pads = s.pads || [];
  const brokenCracks = cracks.filter(cr => cr.broken);
  const block = [...walls, ...turrets, ...brokenCracks];
  if (!stay && block.some(w => w.r === nr && w.c === nc)) return s; // blocked by wall/turret/hole

  const isStage = s.mode === 'stage';
  const hist = { ...s, evts: [] };
  const combo = stay ? 0 : Math.min(s.combo + 1, 20);

  const stepIn = !stay && s.bl.some(b => b.r === nr && b.c === nc && (b.fuse == null || b.fuse <= 1));
  const stepEnemy = !stay && (s.enemies || []).some(e => e.r === nr && e.c === nc);

  // ── bullet motion + spawn ──
  let mv, fz, np = s.np, np2 = s.np2, si = s.si, ln = '';
  let waveFx = null; // 이번 턴 스폰된 웨이브 정보 (보스 발사 연출용)
  // 보스 온그리드: 보스가 상단 셀을 실제 점유하고 N웨이브마다 순간이동(1웨이브 전 예고)
  let bossPos = s.bossPos ? { ...s.bossPos } : null;
  let bossNext = s.bossNext ? { ...s.bossNext } : null;
  let blinked = false;
  let bossWaves = s.bossWaves || 0;
  let lasers = (s.lasers || []).map(l => ({ ...l }));
  const spawnedLasers = [];
  const spawnedEnemies = [];
  const spawnedBombs = [];
  const bossTotal = (isStage && s.stage && s.stage.bossTotal) || 0;
  const bossDone = isStage && s.obj && s.obj.type === 'boss' && bossWaves >= bossTotal;

  if (s.fz > 0) {
    mv = s.bl;
    fz = s.fz - 1;
  } else {
    mv = s.bl
      .map(b => {
        if (b.fuse != null) return { ...b, fuse: b.fuse - 1 }; // timed mine: counts down in place
        const p = nextBulletPos(b);
        if (p.hold) return { ...b, held: true };               // slow: 이번 턴은 제자리
        const out = { ...b, r: p.r, c: p.c };
        if (b.slow) out.held = false;
        if (b.zig) out.zdir = -p.vc;                           // 실제 사용 방향의 반대 = 다음 방향
        else if (p.vc) out.vc = p.vc; // keep vc only if non-zero (clean equality in tests)
        return out;
      })
      .filter(b =>
        b.fuse != null
          ? b.fuse >= 0                                       // detonated (fuse 0) kept this turn, removed next
          : (b.r < R && b.c >= 0 && b.c < C && !block.some(w => w.r === b.r && w.c === b.c)));
    fz = 0;
    si = s.si - 1;
    if (si <= 0 && !bossDone) {
      const goalR = s.goal ? s.goal.r : -99;
      const goalC = s.goal ? s.goal.c : -99;
      if (s.np.cells) {
        // explicit cells (e.g., mark mines) — may carry fuse/vc
        mv = [...mv, ...s.np.cells
          .filter(cell => cell.r >= 0 && cell.r < R && cell.c >= 0 && cell.c < C
            && !block.some(w => w.r === cell.r && w.c === cell.c))
          .map(cell => ({ ...cell }))];
      } else {
        const cols = s.np.c.filter(c =>
          !block.some(w => w.r === 0 && w.c === c) && !(goalR === 0 && c === goalC));
        // 변칙탄 혼입 (엔드리스 전용 — 스테이지/보스 탄은 패턴 정의 그대로, 밸런스 불변)
        const mkBullet = (c) => {
          const base = s.np.vc != null ? { r: 0, c, vc: s.np.vc } : { r: 0, c };
          if (isStage) return base;
          const bb = bal().bullets, e = bal().endless;
          if (s.t >= e.diffNormal && rnd() < bb.slowChance) return { ...base, slow: 1, held: true };
          if (s.t >= e.diffEasy && rnd() < bb.zigChance) return { ...base, zig: 1, zdir: rnd() < 0.5 ? 1 : -1 };
          if (s.t >= e.diffEasy && rnd() < bb.driftChance) return { ...base, vc: rnd() < 0.5 ? 1 : -1, bounce: true };
          return base;
        };
        mv = [...mv, ...cols.map(mkBullet)];
      }
      if (s.np.laser) s.np.laser.forEach(c => spawnedLasers.push({ c, charge: 2 }));
      if (s.np.summon) spawnedEnemies.push({ ...s.np.summon });
      if (s.np.bombs) s.np.bombs.forEach(cell => {
        if (cell.r >= 0 && cell.r < R && cell.c >= 0 && cell.c < C
          && !block.some(w => w.r === cell.r && w.c === cell.c))
          spawnedBombs.push({ r: cell.r, c: cell.c, age: 0, armed: false });
      });
      ln = s.np.n;
      waveFx = {
        boss: isStage && s.obj && s.obj.type === 'boss',
        cols: s.np.cells ? s.np.cells.map(x => x.c) : (s.np.c || []),
        laser: s.np.laser || null,
      };
      if (isStage && s.obj && s.obj.type === 'boss') {
        bossWaves++;
        // 순간이동: 예고된 착지점이 있으면 이번 웨이브에 이동(+착지 사격 플래그),
        // 없고 주기가 되면 다음 착지점을 예고한다 (텔레그래프 없는 위협 금지)
        if (bossPos) {
          const bc = bal().boss;
          if (bossNext) {
            bossPos = bossNext;
            bossNext = null;
            blinked = true;
          } else if (bc.blinkEvery > 0 && bossWaves % bc.blinkEvery === 0) {
            for (let tryN = 0; tryN < 8; tryN++) {
              const cand = { r: Math.floor(rnd() * 3), c: Math.floor(rnd() * C) };
              if (cand.r !== bossPos.r || cand.c !== bossPos.c) { bossNext = cand; break; }
            }
          }
        }
      }
      np = s.np2;
      np2 = isStage
        ? window.HXS.pickPattern(s.stage, s.t + 1, { ...s, bossWaves })
        : rp(s.t + 1);
      si = isStage
        ? window.HXS.stageInterval(s.stage, s.t + 1)
        : (s.t < 30 ? 2 : (rnd() < (s.t < 50 ? 0.25 : 0.48) ? 1 : 2));
    } else if (si <= 0) {
      si = 1; // boss waves exhausted: keep ticking, no new spawn
    }
  }

  // ── 자유탄 (보스 전용 실탄): 턴 동기 전진 + 이번 웨이브 분출 ──
  // 탄마다 시드 랜덤 보폭(step)으로 곡선 궤적을 내려온다. 프리즈면 정지.
  let fb = (s.fb || []).map(f => ({ ...f }));
  let fbSeq = s.fbSeq || 0;
  if (s.fz <= 0) fb = fb.map(f => ({ ...f, p: f.p + f.step })).filter(f => f.p <= 1.05);
  // 자유탄 발사 원점: 보스가 셀 위에 있으면 그 위치에서 발원 (온그리드 체감)
  const fbOrigin = () => {
    if (bossPos) { const bp = hc(bossPos.r, bossPos.c); return { x: bp.x, y: bp.y }; }
    return { x: SW / 2, y: SZ * 1.4 };
  };
  // 스테이지 정의의 fb 필드로 자유탄 강도를 보스별 오버라이드할 수 있다 (데이터 노브)
  const fcEff = { ...bal().freeBullets, ...((isStage && s.stage && s.stage.fb) || {}) };
  const spawnFb = (tx, spread) => {
    if (fb.length >= fcEff.cap) return;
    const o = fbOrigin();
    const sway = (rnd() - 0.5) * 2 * (spread != null ? spread : fcEff.swayPx);
    fb.push({
      id: ++fbSeq,
      x0: o.x, y0: o.y,
      cx1: tx + sway, cy1: SH * 0.33,
      cx2: tx - sway, cy2: SH * 0.66,
      x1: tx + (rnd() - 0.5) * 30, y1: SH + 14,
      p: 0, step: fcEff.stepMin + rnd() * fcEff.stepVar,
    });
  };
  // 공정성 게이트: 안전 열이 3개 미만인 강공(sweepGap·full 등)에는 자유탄을 얹지 않는다
  // — 강공+자유탄 조합이 "회피 불가" 상황을 만들 수 있음(fairness.test로 계약).
  if (waveFx && waveFx.boss && (waveFx.cols || []).length <= C - 3) {
    const fc = fcEff;
    // 폭탄·레이저처럼 발사 열이 없는 웨이브도 자유탄은 쏜다 (시드 랜덤 열) —
    // 폭탄 위주 보스(#19)가 자유탄 압박 없이 무긴장이 되는 걸 방지
    const srcCols = (waveFx.cols && waveFx.cols.length)
      ? waveFx.cols.slice(0, fc.maxPerWave)
      : Array.from({ length: fc.maxPerWave }, () => Math.floor(rnd() * C));
    for (const c of srcCols) spawnFb(hc(0, c).x);
    // 순간이동 착지 사격: 새 위치에서 부채꼴 burst ("순간이동하면서 쏜다")
    if (blinked) {
      const n = bal().boss.blinkShots;
      for (let k = 0; k < n; k++) spawnFb(PD + SZ + (W * (C - 1)) * (k + 0.5) / n, 30);
    }
  }

  // ── bomb zones: age up, arm after telegraph, expire after life (paused while frozen) ──
  const bcfg = bal().boss;
  let bombs = (s.bombs || []).map(b => ({ ...b }));
  if (s.fz <= 0) {
    bombs = bombs
      .map(b => { const age = b.age + 1; return { ...b, age, armed: age >= bcfg.bombTelegraph }; })
      .filter(b => b.age < bcfg.bombTelegraph + bcfg.bombLife);
  }

  // ── turret fire (static cannons, fixed cadence, independent of spawn) ──
  if (s.fz <= 0 && turrets.length) {
    for (const tt of turrets) {
      const per = tt.period || 3, ph = tt.phase || 0;
      if (s.t % per === ph) {
        const br = tt.r + 1, bc = tt.c;
        if (br < R && !block.some(w => w.r === br && w.c === bc)) mv = [...mv, { r: br, c: bc }];
      }
    }
  }

  // ── pad: shove one hex before any item/gem/collision resolves (once, no chaining) ──
  let finalR = nr, finalC = nc;
  if (!stay) {
    const padAt = pads.find(p => p.r === finalR && p.c === finalC);
    if (padAt) {
      const [pdr, pdc] = D(finalR)[padAt.dir];
      const pr = finalR + pdr, pc = finalC + pdc;
      if (pr >= 0 && pr < R && pc >= 0 && pc < C && !block.some(w => w.r === pr && w.c === pc)) {
        finalR = pr; finalC = pc;
      }
    }
  }
  // ── items / gems ──
  let bonus = 0;
  let coinGain = 0;
  let its = s.its;
  let gems = s.gems || [];
  let ht = Math.max(0, s.ht - 1);
  const evts = [];
  // 보스 발사 연출 이벤트: 어느 열에서 쐈는지 + 강공(5열 이상) 여부
  if (waveFx && waveFx.boss) {
    evts.push({ ty: 'wave', cols: waveFx.cols, laser: waveFx.laser, big: (waveFx.cols || []).length >= 5 });
  }

  // bullets crush items
  const crushed = [];
  its = its.filter(it => {
    const hit = mv.some(b => b.r === it.r && b.c === it.c);
    if (hit) crushed.push(it);
    return !hit;
  });
  crushed.forEach(it => evts.push({ ty: 'idel', r: it.r, c: it.c }));

  // collect random item (endless utility pickups)
  const itemAt = its.find(i => i.r === nr && i.c === nc);
  let enemies = (s.enemies || []).map(e => ({ ...e }));
  if (itemAt) {
    its = its.filter(i => i !== itemAt);
    if (itemAt.ty === 'sc') {
      bonus = bal().score.starBase + combo * bal().score.starCombo;
      evts.push({ ty: 'sc', r: nr, c: nc, val: bonus });
    } else if (itemAt.ty === 'bm') {
      const removed = mv.filter(b => hd(nr, nc, b.r, b.c) <= 2);
      mv = mv.filter(b => hd(nr, nc, b.r, b.c) > 2);
      enemies = enemies.filter(e => hd(nr, nc, e.r, e.c) > 2);
      evts.push({ ty: 'bm', r: nr, c: nc, cells: removed.map(b => `${b.r},${b.c}`) });
    } else if (itemAt.ty === 'tp') {
      const safe = safest(mv, { r: nr, c: nc }, walls);
      if (safe) { finalR = safe.r; finalC = safe.c; evts.push({ ty: 'tp', r: finalR, c: finalC }); }
    } else if (itemAt.ty === 'ht') {
      ht = 5;
      evts.push({ ty: 'ht', r: nr, c: nc });
    } else if (itemAt.ty === 'cn') {
      coinGain = bal().coin.pickupValue;
      evts.push({ ty: 'cn', r: nr, c: nc, val: coinGain });
    }
  }

  // collect gem (collect stages)
  const gemAt = gems.find(gm => gm.r === finalR && gm.c === finalC);
  if (gemAt) {
    gems = gems.filter(gm => gm !== gemAt);
    const gv = bal().score.gemBase + combo * bal().score.gemCombo;
    bonus += gv;
    evts.push({ ty: 'gem', r: gemAt.r, c: gemAt.c, val: gv });
  }

  // ── enemies act via ENEMY_KINDS registry; freeze pauses them ──
  const dashCells = []; // cells swept by lunge dashes this turn (lethal)
  if (s.fz <= 0 && enemies.length) {
    const moved = [];
    const ctx = { t: s.t, player: { r: finalR, c: finalC }, block, others: moved, passed: dashCells };
    for (const e of enemies) {
      (ENEMY_KINDS[e.kind] || ENEMY_KINDS.chase).step(e, ctx);
      moved.push(e);
    }
  }
  // ── lasers: telegraph (charge) then fire down the full column ──
  let laserHit = false;
  const liveLasers = [];
  for (const l of lasers) {
    const charge = s.fz > 0 ? l.charge : l.charge - 1; // freeze pauses lasers
    if (charge <= 0) {
      if (finalC === l.c) laserHit = true;
      evts.push({ ty: 'laser', c: l.c });
    } else {
      liveLasers.push({ ...l, charge });
    }
  }
  lasers = [...liveLasers, ...spawnedLasers];

  // ── beam emitters (placed laser): cooldown -> 1-turn dotted telegraph -> full-column zap ──
  // cd counts down (paused while frozen); cd===1 is the telegraph turn (renderer shows the dotted
  // column), cd<=0 fires the whole column c then resets to period. Pierces walls; player-only lethal.
  let beamHit = false;
  const beams = (s.beams || []).map(b => {
    if (s.fz > 0) return { ...b };                    // freeze pauses the cooldown
    const period = b.period || 4;
    let cd = (b.cd == null ? period : b.cd) - 1;
    if (cd <= 0) {                                     // fire this turn
      if (finalC === b.c) beamHit = true;
      evts.push({ ty: 'beam', c: b.c });
      cd = period;                                     // reset; the telegraph turn is when cd reaches 1 again
    }
    return { ...b, cd };
  });

  // ── collision ──
  const hitBullet = mv.some(b =>
    b.r === finalR && b.c === finalC && (b.fuse == null || b.fuse === 0));
  const hitEnemy = enemies.some(e => e.r === finalR && e.c === finalC)
    || dashCells.some(p => p.r === finalR && p.c === finalC);
  const hitSpike = spikes.some(sp => sp.r === finalR && sp.c === finalC);
  // collide vs s.bombs (pre-tick armed state) — matches the board the player saw when choosing this move, like spikes. NOT the aged `bombs`.
  // 폭탄은 자기 칸만이 아니라 폭발 반경(blast) 안이면 같이 터진다 — 텔레그래프/장판 UI가 반경을 표시
  const hitBomb = (s.bombs || []).some(b => b.armed && hd(b.r, b.c, finalR, finalC) <= bal().boss.blast);
  // 자유탄 충돌: 궤적 위치가 속한 셀에 플레이어가 있으면 피격 (스폰 턴은 p=0, 보스 위치라 안전)
  const hitFree = fb.some(f => f.p > 0 && (() => { const cc = fbCell(f); return cc.r === finalR && cc.c === finalC; })());
  // 보스 몸통: 보스가 점유한 셀에 들어가면 피격
  const hitBossBody = !!(bossPos && finalR === bossPos.r && finalC === bossPos.c);
  const ov = stepIn || stepEnemy || hitBullet || hitEnemy || hitSpike || laserHit || beamHit || hitBomb || hitFree || hitBossBody;

  // merge boss-summoned adds AFTER collision — they don't act (or kill) on their spawn turn,
  // so an add materializing on the player's cell is a telegraph, not an untelegraphed death.
  if (spawnedEnemies.length) enemies = [...enemies, ...spawnedEnemies];
  if (spawnedBombs.length) bombs = [...bombs, ...spawnedBombs];

  // ── win checks (stage) ──
  let win = false;
  if (isStage && !ov) {
    const ty = s.obj.type;
    if (ty === 'normal' && s.goal && finalR === s.goal.r && finalC === s.goal.c) win = true;
    else if (ty === 'collect' && gems.length === 0) win = true;
    else if (ty === 'survive' && (s.t + 1) >= s.obj.surviveTurns) win = true;
    else if (ty === 'boss' && bossWaves >= bossTotal && mv.length === 0 && !bombs.some(b => b.armed)) win = true;
  }

  let sc = s.sc;
  if (!ov) sc += (bal().score.surviveBase + Math.min(combo, bal().score.comboCap)) + bonus;

  // stage: dedicated coin-only spawner; endless: full utility pickup pool
  if (!ov && !win) its = isStage
    ? tryCoin(its, { r: finalR, c: finalC }, mv, [
        ...walls, ...turrets, ...spikes, ...cracks, ...pads, ...gems,
        ...enemies, ...(beams || []), ...(s.goal ? [s.goal] : []),
      ])
    : tryItem(its, { r: finalR, c: finalC }, mv);

  // crack collapses when the player leaves it
  let newCracks = cracks;
  if (!stay) {
    const left = cracks.find(cr => cr.r === s.pl.r && cr.c === s.pl.c && !cr.broken);
    if (left) newCracks = cracks.map(cr => (cr === left ? { ...cr, broken: true } : cr));
  }

  // ── graze + dash 게이지 (엔드리스 전용) ──
  // 이동 후 탄이 플레이어 인접 1칸에 있으면 '스침' — 게이지가 차고 보너스 점수.
  // 위험(탄 옆에 붙기) = 보상(대시 자원)이 액티브 루프의 핵심이다.
  let gz = s.gz || 0;
  if (isDash) gz -= dashCost;
  if (!isStage && !ov) {
    const gb = bal().graze;
    const grazeN = mv.filter(b => b.fuse == null && hd(b.r, b.c, finalR, finalC) === 1).length;
    if (grazeN) {
      gz = Math.min(effGaugeMax(s), gz + grazeN * gb.gaugePerBullet);
      sc += grazeN * effGrazeBonus(s);
      evts.push({ ty: 'graze', n: grazeN, r: finalR, c: finalC });
    }
  }

  // ── 사망 시 메타 환원 (엔드리스 전용 · C3): 점수 일부를 코인으로 ──
  let cv = 0;
  if (!isStage && ov) {
    cv = Math.floor(sc * effConvertRate(s));
    if (cv > 0) evts.push({ ty: 'cv', val: cv, r: finalR, c: finalC });
  }

  return {
    ...s,
    pl: { r: finalR, c: finalC },
    bl: mv,
    enemies,
    gems,
    cracks: newCracks,
    t: s.t + 1,
    sc, ov, win,
    np, np2, si, ln,
    its, fz, ht,
    hist,
    combo,
    bossWaves,
    lasers,
    beams,
    evts,
    coins: (s.coins || 0) + coinGain,
    bombs,
    gz,
    cv,
    fb,
    fbSeq,
    bossPos,
    bossNext,
  };
};

// ─── Skills ────────────────────────────────────────────────────
// 모드별 스킬 결제. 성공 시 차감 패치(코인 or 점수)를, 불가 시 null을 돌려준다.
// stage: 코인 + 런당 회수 제한(usesPerRun, 0=무제한) / endless: 점수 차감(현행).
const skillPay = (s, key) => {
  const k = bal().skill;
  if (s.mode === 'stage') {
    const cost = k[key + 'Coin'];
    const lim = k.usesPerRun;
    const left = (s.skillLeft && key in s.skillLeft) ? s.skillLeft[key] : lim;
    if ((s.coins || 0) < cost) return null;
    if (lim > 0 && left <= 0) return null;
    return {
      coins: (s.coins || 0) - cost,
      skillLeft: lim > 0 ? { ...s.skillLeft, [key]: left - 1 } : s.skillLeft,
    };
  }
  const cost = k[key + 'Cost'];
  return s.sc < cost ? null : { sc: s.sc - cost };
};

const doUndo = (s) => {
  if (!s.hist || s.ov || s.win) return s;
  const pay = skillPay(s, 'undo');
  if (!pay) return s;
  return { ...s.hist, ...pay, hist: null, ov: false, win: false, evts: [], skillUses: (s.skillUses || 0) + 1 };
};

const doBomb = (s) => {
  if (s.ov || s.win) return s;
  const pay = skillPay(s, 'bomb');
  if (!pay) return s;
  const rad = bal().skill.bombRadius;
  const xc = s.bl.filter(b => hd(s.pl.r, s.pl.c, b.r, b.c) <= rad);
  return {
    ...s, ...pay,
    bl: s.bl.filter(b => hd(s.pl.r, s.pl.c, b.r, b.c) > rad),
    enemies: (s.enemies || []).filter(e => hd(s.pl.r, s.pl.c, e.r, e.c) > rad),
    skillUses: (s.skillUses || 0) + 1,
    evts: [{ ty: 'bm', r: s.pl.r, c: s.pl.c, cells: xc.map(b => `${b.r},${b.c}`) }],
  };
};

const doFreeze = (s) => {
  if (s.fz > 0 || s.ov || s.win) return s;
  const pay = skillPay(s, 'freeze');
  if (!pay) return s;
  return { ...s, ...pay, fz: bal().skill.freezeTurns, skillUses: (s.skillUses || 0) + 1, evts: [] };
};

// ─── Init (endless) ────────────────────────────────────────────
const initState = (seed) => {
  seedRng(seed);
  const up = loadUp();
  return {
  mode: 'endless',
  up,
  seed: seed != null ? seed : null,
  stage: null,
  pl: { r: R - 1, c: Math.floor(C / 2) },
  bl: [],
  walls: [],
  turrets: [],
  spikes: [],
  lasers: [],
  beams: [],
  enemies: [],
  goal: null,
  gems: [],
  cracks: [],
  pads: [],
  t: 0,
  sc: 0,
  ov: false,
  win: false,
  np: rp(0),
  np2: rp(1),
  si: 1,
  ln: '',
  its: [],
  fz: 0,
  ht: 0,
  hist: null,
  combo: 0,
  bossWaves: 0,
  obj: null,
  skillUses: 0,
  evts: [],
  bombs: [],
  gz: 2 * Math.min(up.startGauge || 0, UPGRADES.startGauge.max),
  cv: 0,
  fb: [],
  fbSeq: 0,
  };
};

// Export to window for cross-script access (text/babel scopes don't share)
Object.assign(window, {
  HX: {
    C, R, SZ, W, RH, PD, SW, SH,
    hc, hp, D, hd,
    PAT, EP, HP, rp, DL,
    safest, tryItem, tryCoin, stepToward, tick,
    ENEMY_KINDS, pickFace, GIMMICKS,
    doUndo, doBomb, doFreeze,
    initState, seedRng, DEFAULT_BAL, bal,
    UPGRADES, loadUp, saveUp, upLv, effDashCost, effGaugeMax, effGrazeBonus, effConvertRate,
    nextBulletPos, fbPoint, fbCellAt, fbCell,
  },
});
