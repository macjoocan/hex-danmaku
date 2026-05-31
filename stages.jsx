/* stages.jsx — stage definitions, pattern selection, boss attacks, progress.
 * Exposes window.HXS. Depends on window.HX (engine).
 */

const { C, R, PAT } = window.HX;

const shuffle = (a) => {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
};
const allCols = Array.from({ length: C }, (_, i) => i);
const clampC = (c) => Math.max(0, Math.min(C - 1, c));
// ping-pong index 0..C-1..0 — moves by exactly 1 each wave (never jumps/wraps)
const ping = (w) => { const m = (C - 1) * 2; const x = ((w % m) + m) % m; return x < C ? x : m - x; };

// ─── Boss attack generators ────────────────────────────────────
// each returns a pattern { n, c:[cols] }
const bossAtk = (atk, s) => {
  const w = s.bossWaves || 0;
  switch (atk.type) {
    case 'rain': {
      const n = atk.n || 3;
      return { n: atk.name || '산탄', c: shuffle(allCols).slice(0, n).sort((a, b) => a - b) };
    }
    case 'aimed': {
      const pc = s.pl.c;
      const cols = [...new Set([clampC(pc - 1), pc, clampC(pc + 1)])];
      return { n: atk.name || '조준 사격', c: cols };
    }
    case 'pincer':
      return { n: atk.name || '협공', c: [0, 1, C - 2, C - 1] };
    case 'sweep': {
      const i = ping(w);
      return { n: atk.name || '휩쓸기', c: [i, clampC(i + 1)] };
    }
    case 'sweepGap': {
      const g = ping(w); // single safe column, moves 1/turn — always reachable
      return { n: atk.name || '빗장', c: allCols.filter(c => c !== g) };
    }
    case 'full': {
      // "near-full": leaves 2 adjacent safe columns that drift 1/turn (survivable)
      const g = ping(w);
      const safe = new Set([g, clampC(g + 1)]);
      return { n: atk.name || '전탄 발사', c: allCols.filter(c => !safe.has(c)) };
    }
    case 'converge': {
      // closing pincer: symmetric columns step inward each wave, then reset
      const k = w % 4;
      const cols = k >= 3 ? [3] : [...new Set([k, C - 1 - k])];
      return { n: atk.name || '조여오기', c: cols };
    }
    case 'alternate': {
      // checkerboard: odd columns one wave, even the next
      return { n: atk.name || '교차탄', c: (w % 2) ? [1, 3, 5] : [0, 2, 4, 6] };
    }
    case 'spread': {
      // pulse outward from center then reset — capped so 2 edge columns always stay safe
      const k = w % 3;
      const cols = [3];
      for (let i = 1; i <= k; i++) { if (3 - i >= 0) cols.push(3 - i); if (3 + i < C) cols.push(3 + i); }
      return { n: atk.name || '확산탄', c: cols.sort((a, b) => a - b) };
    }
    case 'laser': {
      // no falling bullets — charge a telegraphed beam down a column (player's, drifting)
      const lc = (atk.aim ? s.pl.c : ping(w));
      return { n: atk.name || '광선', c: [], laser: [lc] };
    }
    default:
      return { n: '산탄', c: [1, 3, 5] };
  }
};

const phaseFor = (stage, w) => {
  let acc = 0;
  for (let i = 0; i < stage.phases.length; i++) {
    acc += stage.phases[i].turns;
    if (w < acc) return i;
  }
  return stage.phases.length - 1;
};

// pickPattern — used by engine tick to choose the next wave
const pickPattern = (stage, t, s) => {
  if (stage.type === 'boss') {
    const ph = phaseFor(stage, s.bossWaves || 0);
    return bossAtk(stage.phases[ph], s);
  }
  const pool = stage.pool || [PAT.center];
  return pool[Math.floor(Math.random() * pool.length)];
};

const stageInterval = (stage) => stage.interval || 2;

// current boss phase name (for HUD)
const bossPhaseName = (stage, w) =>
  stage.type === 'boss' ? (stage.phases[phaseFor(stage, w)].name || '공격') : '';

// ─── Stage definitions (24) ────────────────────────────────────
// type: normal | survive | collect | boss
// goal {r,c} for normal; surviveTurns for survive; gems[] for collect;
// phases[] + bossTotal for boss. walls[], enemies[] optional gimmicks.
const mid = Math.floor(C / 2);
const P = PAT;
// laser pattern: no falling bullets, charges a telegraphed beam down the given column(s)
const L = (cols, name = '광선') => ({ n: name, c: [], laser: cols });

const STAGES = [
  {
    id: 1, type: 'normal', name: '여명', sub: '게이트까지',
    interval: 2, pool: [P.single, P.edges, P.rdiag],
    goal: { r: 0, c: mid },
    tip: '위로 올라가 포탈에 도달하세요. 총알은 위에서 떨어집니다.',
  },
  {
    id: 2, type: 'normal', name: '돌파', sub: '게이트까지',
    interval: 2, pool: [P.twin, P.diag, P.lwall, P.rwall],
    goal: { r: 0, c: 1 },
    tip: '포탈이 좌측으로 옮겨졌습니다.',
  },
  {
    id: 3, type: 'survive', name: '버티기', sub: '12턴 생존',
    interval: 2, pool: [P.center, P.twin, P.rdiag, P.comb],
    surviveTurns: 12,
    tip: '12턴 동안 살아남으면 클리어.',
  },
  {
    id: 4, type: 'collect', name: '수집가', sub: '별 4개',
    interval: 2, pool: [P.edges, P.single, P.rdiag],
    gems: [{ r: 8, c: 1 }, { r: 6, c: 5 }, { r: 4, c: 2 }, { r: 2, c: 4 }],
    tip: '모든 별을 먹으면 클리어.',
  },
  {
    id: 5, type: 'normal', name: '미궁', sub: '게이트까지',
    interval: 2, pool: [P.diag, P.center, P.vshape],
    goal: { r: 0, c: 5 },
    walls: [{ r: 6, c: 2 }, { r: 6, c: 3 }, { r: 4, c: 4 }, { r: 4, c: 5 }],
    tip: '벽을 피해 길을 찾으세요. 총알도 벽에 막힙니다.',
  },
  {
    id: 6, type: 'boss', name: 'BOSS · 파수꾼', sub: '공격을 견뎌라',
    interval: 2, bossTotal: 14,
    phases: [
      { type: 'rain', n: 2, turns: 5, name: '산탄' },
      { type: 'aimed', turns: 5, name: '조준 사격' },
      { type: 'pincer', turns: 4, name: '협공' },
    ],
    tip: '보스의 모든 공격(HP)을 버텨내면 격파.',
  },
  {
    id: 7, type: 'normal', name: '강행', sub: '게이트까지',
    interval: 2, pool: [P.vshape, P.ivshape, P.focus, P.diag],
    goal: { r: 0, c: mid },
    tip: '패턴이 두꺼워졌습니다.',
  },
  {
    id: 8, type: 'survive', name: '추격전', sub: '16턴 생존',
    interval: 2, pool: [P.twin, P.center, P.comb, P.rdiag],
    surviveTurns: 16,
    enemies: [{ r: 1, c: 0, kind: 'chase' }],
    tip: '추적자가 따라옵니다. 거리를 유지하며 버티세요.',
  },
  {
    id: 9, type: 'collect', name: '보물고', sub: '별 6개',
    interval: 2, pool: [P.diag, P.comb, P.edges, P.center],
    gems: [
      { r: 9, c: 0 }, { r: 8, c: 6 }, { r: 6, c: 3 },
      { r: 4, c: 1 }, { r: 3, c: 5 }, { r: 1, c: 3 },
    ],
    tip: '6개의 별을 모두 회수하세요.',
  },
  {
    id: 10, type: 'normal', name: '봉쇄선', sub: '게이트까지',
    interval: 2, pool: [P.focus, P.vshape, P.diag, P.center],
    goal: { r: 0, c: 0 },
    walls: [{ r: 7, c: 3 }, { r: 5, c: 1 }, { r: 5, c: 2 }, { r: 3, c: 4 }, { r: 3, c: 5 }],
    enemies: [{ r: 1, c: 6, kind: 'chase' }],
    tip: '벽과 추적자를 동시에 상대합니다.',
  },
  {
    id: 11, type: 'boss', name: 'BOSS · 포격수', sub: '공격을 견뎌라',
    interval: 2, bossTotal: 18,
    phases: [
      { type: 'aimed', turns: 5, name: '조준 사격' },
      { type: 'sweep', turns: 5, name: '휩쓸기' },
      { type: 'pincer', turns: 4, name: '협공' },
      { type: 'rain', n: 3, turns: 4, name: '폭우' },
    ],
    tip: '4단계 공격. 조준→휩쓸기→협공→폭우.',
  },
  {
    id: 12, type: 'survive', name: '폭풍전야', sub: '20턴 생존',
    interval: 2, pool: [P.focus, P.barrage, P.comb, P.vshape],
    surviveTurns: 20,
    enemies: [{ r: 1, c: 0, kind: 'chase' }, { r: 1, c: 6, kind: 'chase' }],
    tip: '추적자 둘 + 밀집 탄막. 20턴 버티기.',
  },
  {
    id: 13, type: 'collect', name: '미로의 별', sub: '별 7개',
    interval: 2, pool: [P.diag, P.comb, P.center, P.vshape],
    gems: [
      { r: 9, c: 3 }, { r: 8, c: 0 }, { r: 8, c: 6 }, { r: 6, c: 2 },
      { r: 6, c: 4 }, { r: 4, c: 3 }, { r: 2, c: 3 },
    ],
    walls: [{ r: 7, c: 1 }, { r: 7, c: 5 }, { r: 5, c: 3 }, { r: 3, c: 1 }, { r: 3, c: 5 }],
    tip: '벽 사이를 누비며 7개의 별을 회수하세요.',
  },
  {
    id: 14, type: 'normal', name: '최후의 관문', sub: '게이트까지',
    interval: 2, pool: [P.barrage, P.focus, P.vshape, P.ivshape, P.diag],
    goal: { r: 0, c: mid },
    walls: [{ r: 8, c: 3 }, { r: 6, c: 1 }, { r: 6, c: 5 }, { r: 4, c: 3 }, { r: 2, c: 2 }, { r: 2, c: 4 }],
    enemies: [{ r: 1, c: 0, kind: 'chase' }, { r: 1, c: 6, kind: 'chase' }],
    tip: '벽·추적자·폭격을 모두 뚫고 포탈로.',
  },
  {
    id: 15, type: 'boss', name: 'FINAL · 군주', sub: '최종 결전',
    interval: 2, bossTotal: 22,
    phases: [
      { type: 'rain', n: 3, turns: 5, name: '폭우' },
      { type: 'aimed', turns: 5, name: '조준 사격' },
      { type: 'sweepGap', turns: 6, name: '빗장 휩쓸기' },
      { type: 'pincer', turns: 5, name: '협공' },
      { type: 'full', turns: 5, name: '전탄 발사' },
    ],
    enemies: [{ r: 1, c: 0, kind: 'chase' }],
    tip: '5단계 풀 페이즈 + 추적자. 모든 것을 견뎌라.',
  },

  {
    id: 16, type: 'normal', name: '가시밭', sub: '게이트까지',
    interval: 2, pool: [P.diag, P.center, P.rdiag, P.twin],
    goal: { r: 0, c: mid },
    spikes: [{ r: 7, c: 1 }, { r: 7, c: 5 }, { r: 5, c: 2 }, { r: 5, c: 4 }, { r: 3, c: 3 }],
    tip: '◆ 가시는 밟으면 즉사하지만 막진 않습니다. 탄막은 가시 위를 지나가요.',
  },
  {
    id: 17, type: 'survive', name: '포대', sub: '14턴 생존',
    interval: 2, pool: [P.edges, P.rdiag, P.comb, P.single],
    surviveTurns: 14,
    turrets: [{ r: 3, c: 1, period: 3, phase: 0 }, { r: 4, c: 5, period: 3, phase: 1 }],
    tip: '▲ 포대는 주기적으로 아래로 탄을 쏩니다. 발사 직전 칸이 경고돼요.',
  },
  {
    id: 18, type: 'collect', name: '가시 보고', sub: '별 6개',
    interval: 2, pool: [P.diag, P.comb, P.center],
    gems: [
      { r: 9, c: 1 }, { r: 8, c: 5 }, { r: 6, c: 3 },
      { r: 4, c: 0 }, { r: 4, c: 6 }, { r: 2, c: 3 },
    ],
    spikes: [{ r: 7, c: 3 }, { r: 5, c: 2 }, { r: 5, c: 4 }, { r: 3, c: 1 }, { r: 3, c: 5 }],
    tip: '가시를 피해 별을 모으세요.',
  },
  {
    id: 19, type: 'boss', name: 'BOSS · 포식자', sub: '새로운 공격',
    interval: 2, bossTotal: 18,
    phases: [
      { type: 'spread', turns: 5, name: '확산탄' },
      { type: 'converge', turns: 5, name: '조여오기' },
      { type: 'alternate', turns: 4, name: '교차탄' },
      { type: 'aimed', turns: 4, name: '조준 사격' },
    ],
    tip: '확산·조임·교차 — 새로운 공격 패턴.',
  },
  {
    id: 20, type: 'normal', name: '광선 회랑', sub: '게이트까지',
    interval: 2, pool: [P.diag, P.center, P.vshape, L([3]), L([1, 5], '쌍광선')],
    goal: { r: 0, c: 1 },
    tip: '✦ 광선은 충전 후 세로 한 줄 전체를 관통합니다. 경고 줄을 벗어나세요.',
  },
  {
    id: 21, type: 'survive', name: '섬광 추격', sub: '16턴 생존',
    interval: 2, pool: [P.twin, P.comb, P.center, L([2], '광선'), L([4], '광선')],
    surviveTurns: 16,
    enemies: [{ r: 1, c: 3, kind: 'chase' }],
    tip: '광선 + 추적자. 한 자리에 머물 수 없습니다.',
  },
  {
    id: 22, type: 'collect', name: '요새', sub: '별 7개',
    interval: 2, pool: [P.diag, P.center, P.comb],
    gems: [
      { r: 9, c: 3 }, { r: 8, c: 0 }, { r: 8, c: 6 }, { r: 6, c: 2 },
      { r: 6, c: 4 }, { r: 4, c: 3 }, { r: 2, c: 3 },
    ],
    turrets: [{ r: 5, c: 1, period: 4, phase: 0 }, { r: 5, c: 5, period: 4, phase: 2 }],
    walls: [{ r: 3, c: 2 }, { r: 3, c: 4 }],
    tip: '포대와 벽 사이에서 별 7개를 회수하세요.',
  },
  {
    id: 23, type: 'normal', name: '시련의 길', sub: '게이트까지',
    interval: 2, pool: [P.focus, P.vshape, P.diag, L([3], '광선')],
    goal: { r: 0, c: mid },
    walls: [{ r: 8, c: 2 }, { r: 8, c: 4 }, { r: 4, c: 3 }],
    spikes: [{ r: 6, c: 1 }, { r: 6, c: 5 }, { r: 2, c: 2 }, { r: 2, c: 4 }],
    turrets: [{ r: 6, c: 3, period: 3, phase: 0 }],
    enemies: [{ r: 1, c: 0, kind: 'chase' }],
    tip: '가시·벽·포대·광선·추적자 — 모든 기믹의 집결.',
  },
  {
    id: 24, type: 'boss', name: 'TRUE FINAL · 심연', sub: '진 최종전',
    interval: 2, bossTotal: 23,
    phases: [
      { type: 'spread', turns: 4, name: '확산탄' },
      { type: 'laser', aim: true, turns: 4, name: '추적 광선' },
      { type: 'converge', turns: 4, name: '조여오기' },
      { type: 'alternate', turns: 4, name: '교차탄' },
      { type: 'sweepGap', turns: 4, name: '빗장 휩쓸기' },
      { type: 'full', turns: 3, name: '전탄 발사' },
    ],
    enemies: [{ r: 1, c: 6, kind: 'chase' }],
    tip: '확산→광선→조임→교차→빗장→전탄. 추적자까지. 진정한 끝.',
  },
];

// ─── initStage ─────────────────────────────────────────────────
const objFor = (def) => {
  if (def.type === 'survive') return { type: 'survive', surviveTurns: def.surviveTurns };
  if (def.type === 'collect') return { type: 'collect', total: def.gems.length };
  if (def.type === 'boss') return { type: 'boss' };
  return { type: 'normal' };
};

const initStage = (idx) => {
  const def = STAGES[idx];
  const base = {
    mode: 'stage',
    stage: def,
    stageIdx: idx,
    pl: def.start ? { ...def.start } : { r: R - 1, c: mid },
    bl: [],
    walls: (def.walls || []).map(w => ({ ...w })),
    turrets: (def.turrets || []).map(t => ({ ...t })),
    spikes: (def.spikes || []).map(sp => ({ ...sp })),
    lasers: [],
    enemies: (def.enemies || []).map(e => ({ ...e })),
    goal: def.goal ? { ...def.goal } : null,
    gems: (def.gems || []).map(g => ({ ...g })),
    t: 0,
    sc: 0,
    ov: false,
    win: false,
    ln: '',
    its: [],
    fz: 0,
    ht: 0,
    hist: null,
    combo: 0,
    bossWaves: 0,
    obj: objFor(def),
    skillUses: 0,
    si: def.firstDelay != null ? def.firstDelay : 1,
    evts: [],
  };
  base.np = pickPattern(def, 0, base);
  base.np2 = pickPattern(def, 1, { ...base, bossWaves: def.type === 'boss' ? 1 : 0 });
  return base;
};

// progress objective text for HUD
const objText = (s) => {
  const o = s.obj;
  if (!o) return '';
  if (o.type === 'normal') {
    const d = s.goal ? window.HX.hd(s.pl.r, s.pl.c, s.goal.r, s.goal.c) : 0;
    return { label: '포탈까지', value: `${d}칸`, frac: null };
  }
  if (o.type === 'survive') {
    const left = Math.max(0, o.surviveTurns - s.t);
    return { label: '생존', value: `${left}턴`, frac: 1 - left / o.surviveTurns };
  }
  if (o.type === 'collect') {
    const got = o.total - s.gems.length;
    return { label: '별', value: `${got}/${o.total}`, frac: got / o.total };
  }
  if (o.type === 'boss') {
    const total = s.stage.bossTotal;
    const left = Math.max(0, total - s.bossWaves);
    return { label: bossPhaseName(s.stage, s.bossWaves), value: '', frac: left / total, hp: true, left, total };
  }
  return '';
};

// ─── Progress (localStorage) ───────────────────────────────────
const loadStars = () => {
  try { return JSON.parse(localStorage.getItem('hex_stage_stars') || '{}'); }
  catch { return {}; }
};
const saveStars = (id, stars) => {
  const all = loadStars();
  if (!all[id] || stars > all[id]) {
    all[id] = stars;
    try { localStorage.setItem('hex_stage_stars', JSON.stringify(all)); } catch {}
  }
  return loadStars();
};
const isUnlocked = (idx, stars) => idx === 0 || !!stars[STAGES[idx - 1].id];

// 3 stars: no skills · 2 stars: ≤2 skills · 1 star: cleared
const rateStage = (s) => {
  const u = s.skillUses || 0;
  return u === 0 ? 3 : u <= 2 ? 2 : 1;
};

const TYPE_META = {
  normal:  { icon: '◈', label: '돌파', color: '#38bdf8' },
  survive: { icon: '⧗', label: '생존', color: '#fbbf24' },
  collect: { icon: '★', label: '수집', color: '#34d399' },
  boss:    { icon: '☠', label: '보스', color: '#fb7185' },
};

Object.assign(window, {
  HXS: {
    STAGES,
    pickPattern, stageInterval, bossPhaseName, phaseFor,
    initStage, objText, objFor,
    loadStars, saveStars, isUnlocked, rateStage,
    TYPE_META,
  },
});
