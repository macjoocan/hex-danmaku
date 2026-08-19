// endless-sim.mjs — 엔드리스 모드 게임성 검증: 그레이즈+대시(1차 세트)의 효과 측정
// 봇 2종을 같은 시드로 비교한다:
//   baseline = 2-ply 스마트 회피 (대시 미사용)
//   dash-bot = 동일 + 안전한 이웃 수가 없을 때만 대시(비상 탈출) 사용
// 사용: node tools/endless-sim.mjs [seeds=200] [cap=300]
import { loadGame } from '../tests/harness.mjs';

const N = parseInt(process.argv[2], 10) || 200;
const CAP = parseInt(process.argv[3], 10) || 300;

function candidates(HX, s, useDash) {
  const opts = [{ r: s.pl.r, c: s.pl.c }, ...HX.D(s.pl.r).map(([dr, dc]) => ({ r: s.pl.r + dr, c: s.pl.c + dc }))];
  const dashOpts = [];
  if (useDash && (s.gz || 0) >= HX.bal().dash.cost) {
    for (let r = 0; r < HX.R; r++) for (let c = 0; c < HX.C; c++) {
      if (HX.hd(r, c, s.pl.r, s.pl.c) === HX.bal().dash.range) dashOpts.push({ r, c });
    }
  }
  return { normal: opts, dash: dashOpts };
}

function safeTicks(HX, s, opts) {
  return opts
    .filter(o => o.r >= 0 && o.r < HX.R && o.c >= 0 && o.c < HX.C)
    .map(o => HX.tick(s, o.r, o.c))
    .filter(n => n !== s && !n.ov);
}

// 2-ply: 생존 가능 후속 수가 많은 수 우선 (대시 후보는 이웃 안전 수가 0일 때만 합류)
function bestNext(HX, s, useDash) {
  const { normal, dash } = candidates(HX, s, useDash);
  let pool = safeTicks(HX, s, normal);
  let usedDash = false;
  if (!pool.length && dash.length) {
    pool = safeTicks(HX, s, dash);
    usedDash = pool.length > 0;
  }
  if (!pool.length) return { n: null, usedDash: false };
  let best = pool[0], bestKey = -1;
  for (const n of pool) {
    const f = safeTicks(HX, n, candidates(HX, n, useDash).normal);
    const survivable = f.filter(m => safeTicks(HX, m, candidates(HX, m, false).normal).length > 0).length;
    const key = survivable * 100 + f.length;
    if (key > bestKey) { bestKey = key; best = n; }
  }
  return { n: best, usedDash };
}

function run(seed, useDash) {
  const { HX } = loadGame({ seed });
  let s = HX.initState(seed);
  let grazes = 0, dashes = 0;
  while (!s.ov && s.t < CAP) {
    const { n, usedDash } = bestNext(HX, s, useDash);
    if (!n) break;
    if (usedDash) dashes++;
    if (n.evts && n.evts.some(e => e.ty === 'graze')) grazes += n.evts.find(e => e.ty === 'graze').n;
    s = n;
  }
  return { turns: s.t, died: !!s.ov || s.t < CAP, grazes, dashes, score: s.sc };
}

const agg = (rows, k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
const med = (rows, k) => rows.map(r => r[k]).sort((a, b) => a - b)[Math.floor(rows.length / 2)];

const base = [], dash = [];
for (let seed = 1; seed <= N; seed++) {
  base.push(run(seed, false));
  dash.push(run(seed, true));
  if (seed % 50 === 0) process.stderr.write(`${seed}/${N}\n`);
}

console.log(`# endless-sim — ${N} seeds, cap ${CAP}턴, 2-ply 회피 봇\n`);
console.log('| 봇 | 평균 생존턴 | 중앙값 | 평균 점수 | 턴당 그레이즈 | 런당 대시 |');
console.log('|---|---|---|---|---|---|');
console.log(`| baseline(대시 없음) | ${agg(base, 'turns').toFixed(1)} | ${med(base, 'turns')} | ${agg(base, 'score').toFixed(0)} | - | - |`);
console.log(`| dash-bot(비상 탈출만) | ${agg(dash, 'turns').toFixed(1)} | ${med(dash, 'turns')} | ${agg(dash, 'score').toFixed(0)} | ${(agg(dash, 'grazes') / agg(dash, 'turns')).toFixed(3)} | ${agg(dash, 'dashes').toFixed(2)} |`);
const delta = ((agg(dash, 'turns') / agg(base, 'turns') - 1) * 100).toFixed(1);
console.log(`\n생존턴 변화: ${delta}% (대시 도입 효과 — 봇은 비상시에만 사용하므로 하한 추정)`);
