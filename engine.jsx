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

const rp = (t) => {
  const pool =
    t < 15 ? EP :
    t < 35 ? (Math.random() < 0.30 ? HP : EP) :
    t < 55 ? (Math.random() < 0.55 ? HP : EP) :
             (Math.random() < 0.75 ? HP : EP);
  return pool[Math.floor(Math.random() * pool.length)];
};

// difficulty label (endless)
const DL = (t) =>
  t < 15 ? { lb: 'EASY',   sub: '초급',  c: '#5eead4' } :
  t < 35 ? { lb: 'NORMAL', sub: '중급',  c: '#fbbf24' } :
  t < 60 ? { lb: 'HARD',   sub: '고급',  c: '#fb7185' } :
           { lb: 'CHAOS',  sub: '극한',  c: '#f43f5e' };

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
  if (its.length >= 3) return its;
  if (Math.random() > 0.24) return its;
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
  const cell = cands[Math.floor(Math.random() * cands.length)];
  const roll = Math.random();
  const ty = roll < 0.45 ? 'sc'
           : roll < 0.63 ? 'bm'
           : roll < 0.75 ? 'tp'
           : 'ht';
  return [...its, { ...cell, ty }];
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
  const block = turrets.length ? [...walls, ...turrets] : walls;
  if (!stay && block.some(w => w.r === nr && w.c === nc)) return s; // blocked by wall/turret

  const isStage = s.mode === 'stage';
  const hist = { ...s, evts: [] };
  const combo = stay ? 0 : Math.min(s.combo + 1, 20);

  const stepIn = !stay && s.bl.some(b => b.r === nr && b.c === nc);
  const stepEnemy = !stay && (s.enemies || []).some(e => e.r === nr && e.c === nc);

  // ── bullet motion + spawn ──
  let mv, fz, np = s.np, np2 = s.np2, si = s.si, ln = '';
  let bossWaves = s.bossWaves || 0;
  let lasers = (s.lasers || []).map(l => ({ ...l }));
  const spawnedLasers = [];
  const bossTotal = (isStage && s.stage && s.stage.bossTotal) || 0;
  const bossDone = isStage && s.obj && s.obj.type === 'boss' && bossWaves >= bossTotal;

  if (s.fz > 0) {
    mv = s.bl;
    fz = s.fz - 1;
  } else {
    mv = s.bl
      .map(b => ({ r: b.r + 1, c: b.c }))
      .filter(b => b.r < R && !block.some(w => w.r === b.r && w.c === b.c));
    fz = 0;
    si = s.si - 1;
    if (si <= 0 && !bossDone) {
      const goalR = s.goal ? s.goal.r : -99;
      const goalC = s.goal ? s.goal.c : -99;
      const cols = s.np.c.filter(c =>
        !block.some(w => w.r === 0 && w.c === c) && !(goalR === 0 && c === goalC));
      mv = [...mv, ...cols.map(c => ({ r: 0, c }))];
      if (s.np.laser) s.np.laser.forEach(c => spawnedLasers.push({ c, charge: 2 }));
      ln = s.np.n;
      if (isStage && s.obj && s.obj.type === 'boss') bossWaves++;
      np = s.np2;
      np2 = isStage
        ? window.HXS.pickPattern(s.stage, s.t + 1, { ...s, bossWaves })
        : rp(s.t + 1);
      si = isStage
        ? window.HXS.stageInterval(s.stage, s.t + 1)
        : (s.t < 30 ? 2 : (Math.random() < (s.t < 50 ? 0.25 : 0.48) ? 1 : 2));
    } else if (si <= 0) {
      si = 1; // boss waves exhausted: keep ticking, no new spawn
    }
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

  // ── items / gems ──
  let finalR = nr, finalC = nc;
  let bonus = 0;
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
      bonus = 50 + combo * 3;
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
    }
  }

  // collect gem (collect stages)
  const gemAt = gems.find(gm => gm.r === finalR && gm.c === finalC);
  if (gemAt) {
    gems = gems.filter(gm => gm !== gemAt);
    const gv = 80 + combo * 4;
    bonus += gv;
    evts.push({ ty: 'gem', r: gemAt.r, c: gemAt.c, val: gv });
  }

  // ── enemies chase player's final cell (half-speed: every other turn) ──
  if (s.fz <= 0 && enemies.length && (s.t % 2 === 1)) {
    const moved = [];
    for (const e of enemies) {
      const np2pos = stepToward(e, { r: finalR, c: finalC }, block, moved);
      e.r = np2pos.r; e.c = np2pos.c;
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

  // ── collision ──
  const hitBullet = mv.some(b => b.r === finalR && b.c === finalC);
  const hitEnemy = enemies.some(e => e.r === finalR && e.c === finalC);
  const hitSpike = spikes.some(sp => sp.r === finalR && sp.c === finalC);
  const ov = stepIn || stepEnemy || hitBullet || hitEnemy || hitSpike || laserHit;

  // ── win checks (stage) ──
  let win = false;
  if (isStage && !ov) {
    const ty = s.obj.type;
    if (ty === 'normal' && s.goal && finalR === s.goal.r && finalC === s.goal.c) win = true;
    else if (ty === 'collect' && gems.length === 0) win = true;
    else if (ty === 'survive' && (s.t + 1) >= s.obj.surviveTurns) win = true;
    else if (ty === 'boss' && bossWaves >= bossTotal && mv.length === 0) win = true;
  }

  let sc = s.sc;
  if (!ov) sc += (10 + Math.min(combo, 10)) + bonus;

  // random utility items only spawn in endless
  if (!ov && !win && !isStage) its = tryItem(its, { r: finalR, c: finalC }, mv);

  return {
    ...s,
    pl: { r: finalR, c: finalC },
    bl: mv,
    enemies,
    gems,
    t: s.t + 1,
    sc, ov, win,
    np, np2, si, ln,
    its, fz, ht,
    hist,
    combo,
    bossWaves,
    lasers,
    evts,
  };
};

// ─── Skills ────────────────────────────────────────────────────
const doUndo = (s) =>
  (!s.hist || s.sc < 30 || s.ov || s.win) ? s
  : { ...s.hist, sc: s.sc - 30, hist: null, ov: false, win: false, evts: [], skillUses: (s.skillUses || 0) + 1 };

const doBomb = (s) => {
  if (s.sc < 50 || s.ov || s.win) return s;
  const xc = s.bl.filter(b => hd(s.pl.r, s.pl.c, b.r, b.c) <= 2);
  return {
    ...s,
    bl: s.bl.filter(b => hd(s.pl.r, s.pl.c, b.r, b.c) > 2),
    enemies: (s.enemies || []).filter(e => hd(s.pl.r, s.pl.c, e.r, e.c) > 2),
    sc: s.sc - 50,
    skillUses: (s.skillUses || 0) + 1,
    evts: [{ ty: 'bm', r: s.pl.r, c: s.pl.c, cells: xc.map(b => `${b.r},${b.c}`) }],
  };
};

const doFreeze = (s) =>
  (s.sc < 80 || s.fz > 0 || s.ov || s.win) ? s
  : { ...s, fz: 3, sc: s.sc - 80, skillUses: (s.skillUses || 0) + 1, evts: [] };

// ─── Init (endless) ────────────────────────────────────────────
const initState = () => ({
  mode: 'endless',
  stage: null,
  pl: { r: R - 1, c: Math.floor(C / 2) },
  bl: [],
  walls: [],
  turrets: [],
  spikes: [],
  lasers: [],
  enemies: [],
  goal: null,
  gems: [],
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
});

// Export to window for cross-script access (text/babel scopes don't share)
Object.assign(window, {
  HX: {
    C, R, SZ, W, RH, PD, SW, SH,
    hc, hp, D, hd,
    PAT, EP, HP, rp, DL,
    safest, tryItem, stepToward, tick,
    doUndo, doBomb, doFreeze,
    initState,
  },
});
