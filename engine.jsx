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
  boss: { bombsPerWave: 2, bombLife: 2, bombTelegraph: 1 },
};
const bal = () => (typeof window !== 'undefined' && window.HXB) ? window.HXB : DEFAULT_BAL;

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

// ─── Main tick (handles both modes) ────────────────────────────
const tick = (s, nr, nc) => {
  if (s.ov || s.win) return s;

  const stay = nr === s.pl.r && nc === s.pl.c;
  const isNeighbor = D(s.pl.r).some(([dr, dc]) => s.pl.r + dr === nr && s.pl.c + dc === nc);
  if (!stay && !isNeighbor) return s;
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
        let vc = b.vc || 0;
        let nc = b.c + vc;
        if (b.bounce && (nc < 0 || nc >= C)) { vc = -vc; nc = b.c + vc; } // reflect at edge
        const out = { ...b, r: b.r + 1, c: nc };
        if (vc) out.vc = vc; // keep vc only if non-zero (clean equality in tests)
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
        mv = [...mv, ...cols.map(c => (s.np.vc != null ? { r: 0, c, vc: s.np.vc } : { r: 0, c }))];
      }
      if (s.np.laser) s.np.laser.forEach(c => spawnedLasers.push({ c, charge: 2 }));
      if (s.np.summon) spawnedEnemies.push({ ...s.np.summon });
      if (s.np.bombs) s.np.bombs.forEach(cell => {
        if (cell.r >= 0 && cell.r < R && cell.c >= 0 && cell.c < C
          && !block.some(w => w.r === cell.r && w.c === cell.c))
          spawnedBombs.push({ r: cell.r, c: cell.c, age: 0, armed: false });
      });
      ln = s.np.n;
      if (isStage && s.obj && s.obj.type === 'boss') bossWaves++;
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
  const hitBomb = (s.bombs || []).some(b => b.armed && b.r === finalR && b.c === finalC);
  const ov = stepIn || stepEnemy || hitBullet || hitEnemy || hitSpike || laserHit || beamHit || hitBomb;

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
  return {
  mode: 'endless',
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
  },
});
