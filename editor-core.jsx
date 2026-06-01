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

const buildBalance = (patch) => deepMerge(window.HX.DEFAULT_BAL, patch || {});

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

const parseOverrides = (json) => {
  const obj = JSON.parse(json); // throws on malformed JSON
  if (!obj || typeof obj !== 'object') throw new Error('payload must be an object');
  const stages = obj.stages || { overrides: {}, custom: [] };
  if (typeof stages !== 'object' || typeof (stages.overrides || {}) !== 'object' || !Array.isArray(stages.custom || []))
    throw new Error('invalid stages section');
  if (obj.res && typeof obj.res !== 'object') throw new Error('invalid res section');
  if (obj.balance && typeof obj.balance !== 'object') throw new Error('invalid balance section');
  return { stages, balance: obj.balance || {}, res: obj.res || {} };
};

const importOverrides = (json) => {
  const parsed = parseOverrides(json); // atomic: throws before any write
  writeLS(HXE_LS.stages, parsed.stages);
  writeLS(HXE_LS.balance, parsed.balance);
  writeLS(HXE_LS.res, parsed.res);
  applyOverrides();
};

// fairness/reachability heuristic via simulation; robust to engine errors on bad defs
const validateStage = (def, { turns = 30 } = {}) => {
  const warnings = [];
  const HX = window.HX, HXS = window.HXS;
  try {
    let s = HXS.initStageDef(def, 0);
    for (let i = 0; i < turns && !s.win && !s.ov; i++) {
      const opts = [{ r: s.pl.r, c: s.pl.c }, ...HX.D(s.pl.r).map(([dr, dc]) => ({ r: s.pl.r + dr, c: s.pl.c + dc }))];
      let next = null;
      for (const o of opts) {
        if (o.r < 0 || o.r >= HX.R || o.c < 0 || o.c >= HX.C) continue;
        const n = HX.tick(s, o.r, o.c);
        if (n !== s && !n.ov) { next = n; break; }
      }
      if (!next) { warnings.push(`턴 ${s.t}: 안전한 이동이 없음 — 불공정 가능`); break; }
      s = next;
    }
  } catch (e) {
    return { ok: false, warnings: ['시뮬레이션 오류: ' + (e && e.message)] };
  }
  return { ok: warnings.length === 0, warnings };
};

// merge any localStorage overrides on load so the game sees edited data
applyOverrides();

window.HXE = {
  LS: HXE_LS, deepMerge,
  applyOverrides, applyStageOverrides, applyResOverrides, buildBalance,
  serializeOverrides, parseOverrides, importOverrides, validateStage,
  readLS, writeLS, BASE_STAGES, BASE_RES,
};
