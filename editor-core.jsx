/* editor-core.jsx — pure data layer for the editor (no JSX/React).
 * Builds window.HXB and merges localStorage overrides into STAGES / RES / HXB.
 * Loaded after stages + resources, before screens/editor/app. */

const HXE_LS = { stages: 'hex_edit_stages', balance: 'hex_edit_balance', res: 'hex_edit_res' };

const deepMerge = (base, patch) => {
  if (Array.isArray(patch)) return patch.slice();
  if (patch && typeof patch === 'object') {
    const out = (base && typeof base === 'object' && !Array.isArray(base)) ? { ...base } : {};
    for (const k of Object.keys(patch)) {
      const bv = out[k], pv = patch[k];
      out[k] = (bv && typeof bv === 'object' && !Array.isArray(bv) && pv && typeof pv === 'object' && !Array.isArray(pv))
        ? deepMerge(bv, pv) : (Array.isArray(pv) ? pv.slice() : pv);
    }
    return out;
  }
  return patch;
};

const readLS = (key, fallback) => {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
};
const writeLS = (key, val) => {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(val)); } catch {}
};

// A clamp-to->=1 for engine-timing fields. Clearing a slider yields Number('') === 0, and
// chaseEvery:0 makes `t % 0` === NaN (chasers freeze); lungeDash:0 no-ops the dash. Guard here
// so a bad slider/localStorage/import value can never reach the engine.
const atLeastOne = (v) => Math.max(1, Math.floor(v) || 1); // 0/NaN/null -> 1
const buildBalance = (patch) => {
  const b = deepMerge(window.HX.DEFAULT_BAL, patch || {});
  if (b.enemy) {
    b.enemy.chaseEvery = atLeastOne(b.enemy.chaseEvery);
    b.enemy.lungeDash = atLeastOne(b.enemy.lungeDash);
  }
  if (b.coin) {
    // All coin keys share the >=0-number invariant — iterate DEFAULT_BAL to stay drift-proof.
    Object.keys(window.HX.DEFAULT_BAL.coin).forEach(k => { b.coin[k] = Math.max(0, Number(b.coin[k]) || 0); });
  }
  if (b.skill) {
    // Explicit list: bombRadius/freezeTurns are >=1 engine fields clamped via atLeastOne elsewhere.
    ['undoCoin', 'bombCoin', 'freezeCoin', 'usesPerRun'].forEach(k => {
      b.skill[k] = Math.max(0, Number(b.skill[k]) || 0);
    });
  }
  return b;
};

const applyStageOverrides = (baseStages, data) => {
  const overrides = (data && data.overrides) || {};
  const custom = (data && data.custom) || [];
  const merged = baseStages.map(st => (overrides[st.id] ? deepMerge(st, overrides[st.id]) : st));
  return [...merged, ...custom];
};

const applyResOverrides = (baseRes, patch) => {
  if (!patch) return { ...baseRes };
  const out = { ...baseRes };
  for (const k of Object.keys(patch)) out[k] = deepMerge(baseRes[k] || {}, patch[k]);
  return out;
};

// pristine snapshots so re-applying is idempotent
const BASE_STAGES = window.HXS.STAGES.slice();
const BASE_RES = { ...window.HXR.RES };

const applyOverrides = () => {
  const stageData = readLS(HXE_LS.stages, { overrides: {}, custom: [] });
  const balPatch = readLS(HXE_LS.balance, {});
  const resPatch = readLS(HXE_LS.res, {});
  // STAGES mutated in place (same array reference used by stages.jsx / initStage)
  const eff = applyStageOverrides(BASE_STAGES, stageData);
  window.HXS.STAGES.length = 0;
  eff.forEach(s => window.HXS.STAGES.push(s));
  // RES mutated in place
  const effRes = applyResOverrides(BASE_RES, resPatch);
  Object.keys(window.HXR.RES).forEach(k => { delete window.HXR.RES[k]; });
  Object.assign(window.HXR.RES, effRes);
  // balance
  window.HXB = buildBalance(balPatch);
};

const serializeOverrides = () => JSON.stringify({
  version: 1,
  stages: readLS(HXE_LS.stages, { overrides: {}, custom: [] }),
  balance: readLS(HXE_LS.balance, {}),
  res: readLS(HXE_LS.res, {}),
}, null, 2);

// arrays are typeof 'object', so reject them explicitly — a plain object is required for every
// section, else a malformed array slips through and corrupts state (e.g. balance:[] makes HXB an array).
const isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const parseOverrides = (json) => {
  const obj = JSON.parse(json); // throws on malformed JSON
  if (!isPlainObject(obj)) throw new Error('payload must be an object');
  const stages = obj.stages || { overrides: {}, custom: [] };
  if (!isPlainObject(stages) || !isPlainObject(stages.overrides || {}) || !Array.isArray(stages.custom || []))
    throw new Error('invalid stages section');
  if (obj.res && !isPlainObject(obj.res)) throw new Error('invalid res section');
  if (obj.balance && !isPlainObject(obj.balance)) throw new Error('invalid balance section');
  return { stages, balance: obj.balance || {}, res: obj.res || {} };
};

const importOverrides = (json) => {
  const parsed = parseOverrides(json); // atomic: throws before any write
  writeLS(HXE_LS.stages, parsed.stages);
  writeLS(HXE_LS.balance, parsed.balance);
  writeLS(HXE_LS.res, parsed.res);
  applyOverrides();
};

// fairness/reachability heuristic via simulation; robust to engine errors on bad defs.
// Mirrors tests/fairness.test.mjs: a single 1-ply greedy walk corners itself on RNG pools
// and false-warns on fair stages, so we (a) use a 2-ply lookahead dodge that respects
// telegraphed threats, and (b) run several trials and only warn if EVERY trial gets stuck
// (the pool is random per run, so one unlucky roll must not condemn a fair stage).
const validateStage = (def, { turns = 30, trials = 8 } = {}) => {
  const HX = window.HX, HXS = window.HXS;
  // all non-game-over next states reachable in one move (stay or a neighbor)
  const safeMoves = (s) => {
    const opts = [{ r: s.pl.r, c: s.pl.c }, ...HX.D(s.pl.r).map(([dr, dc]) => ({ r: s.pl.r + dr, c: s.pl.c + dc }))];
    const res = [];
    for (const o of opts) {
      if (o.r < 0 || o.r >= HX.R || o.c < 0 || o.c >= HX.C) continue;
      const n = HX.tick(s, o.r, o.c);
      if (n !== s && !n.ov) res.push(n);
    }
    return res;
  };
  const hasSafe = (s) => safeMoves(s).length > 0;
  // pick the move that keeps the most 2-turn-survivable follow-ups open
  const bestNext = (s) => {
    const moves = safeMoves(s);
    if (!moves.length) return null;
    let best = moves[0], bestScore = -1;
    for (const n of moves) {
      const followups = safeMoves(n);
      const survivable = followups.filter(hasSafe).length;
      const score = survivable * 100 + followups.length;
      if (score > bestScore) { bestScore = score; best = n; }
    }
    return best;
  };
  // one greedy 2-ply playthrough; returns the failing turn, or null if it survived/won
  const runTrial = () => {
    let s = HXS.initStageDef(def, 0);
    for (let i = 0; i < turns && !s.win && !s.ov; i++) {
      if (!hasSafe(s)) return s.t;
      const n = bestNext(s);
      if (!n) return s.t;
      s = n;
    }
    return null;
  };
  try {
    let firstFailTurn = null;
    for (let k = 0; k < trials; k++) {
      const fail = runTrial();
      if (fail == null) return { ok: true, warnings: [] }; // any trial that survives ⇒ fair
      if (firstFailTurn == null) firstFailTurn = fail;
    }
    return { ok: false, warnings: [`턴 ${firstFailTurn}: 안전한 이동이 없음 — 불공정 가능`] };
  } catch (e) {
    return { ok: false, warnings: ['시뮬레이션 오류: ' + (e && e.message)] };
  }
};

// merge any localStorage overrides on load so the game sees edited data
applyOverrides();

window.HXE = {
  LS: HXE_LS, deepMerge,
  applyOverrides, applyStageOverrides, applyResOverrides, buildBalance,
  serializeOverrides, parseOverrides, importOverrides, validateStage,
  readLS, writeLS, BASE_STAGES, BASE_RES,
};
