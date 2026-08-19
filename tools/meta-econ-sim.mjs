// meta-econ-sim.mjs — 2차 세트(B1+C3) 경제 수지 검증
// 질문: "엔드리스 수입만으로 전 노드 해금까지 몇 런인가?" (그라인드 과다/과소 판정)
// 방법: dash-bot으로 무강화/풀강화 평균 점수를 실측 → 진행 시뮬(탐욕 구매)로 런 수 계산.
// 가정(명시): 중간 강화 상태의 점수는 보유 레벨 비율로 선형 보간 <추정>.
// 사용: node tools/meta-econ-sim.mjs [seeds=40] [cap=300]
import { loadGame } from '../tests/harness.mjs';

const N = parseInt(process.argv[2], 10) || 40;
const CAP = parseInt(process.argv[3], 10) || 300;

function candidates(HX, s, useDash) {
  const opts = [{ r: s.pl.r, c: s.pl.c }, ...HX.D(s.pl.r).map(([dr, dc]) => ({ r: s.pl.r + dr, c: s.pl.c + dc }))];
  const dashOpts = [];
  if (useDash && (s.gz || 0) >= HX.effDashCost(s)) {
    for (let r = 0; r < HX.R; r++) for (let c = 0; c < HX.C; c++) {
      if (HX.hd(r, c, s.pl.r, s.pl.c) === HX.bal().dash.range) dashOpts.push({ r, c });
    }
  }
  return { normal: opts, dash: dashOpts };
}
const safeTicks = (HX, s, opts) => opts
  .filter(o => o.r >= 0 && o.r < HX.R && o.c >= 0 && o.c < HX.C)
  .map(o => HX.tick(s, o.r, o.c)).filter(n => n !== s && !n.ov);

function bestNext(HX, s) {
  const { normal, dash } = candidates(HX, s, true);
  let pool = safeTicks(HX, s, normal);
  if (!pool.length && dash.length) pool = safeTicks(HX, s, dash);
  if (!pool.length) return null;
  let best = pool[0], bestKey = -1;
  for (const n of pool) {
    const f = safeTicks(HX, n, candidates(HX, n, true).normal);
    const sv = f.filter(m => safeTicks(HX, m, candidates(HX, m, false).normal).length > 0).length;
    const key = sv * 100 + f.length;
    if (key > bestKey) { bestKey = key; best = n; }
  }
  return best;
}

function avgScore(up) {
  let total = 0;
  for (let seed = 1; seed <= N; seed++) {
    const { HX } = loadGame({ seed });
    const start = { ...HX.initState(seed), up, gz: 2 * Math.min(up.startGauge || 0, 2) };
    let s = start;
    while (!s.ov && s.t < CAP) {
      const n = bestNext(HX, s);
      if (!n) break;
      s = n;
    }
    total += s.sc;
  }
  return total / N;
}

const { HX } = loadGame({ seed: 1 });
const UP = HX.UPGRADES;
const FULL = Object.fromEntries(Object.entries(UP).map(([k, u]) => [k, u.max]));
const totalLevels = Object.values(UP).reduce((a, u) => a + u.max, 0);
const totalCost = Object.values(UP).reduce((a, u) => a + u.cost.reduce((x, y) => x + y, 0), 0);

process.stderr.write('measuring baseline...\n');
const scoreNone = avgScore({});
process.stderr.write('measuring full-upgrade...\n');
const scoreFull = avgScore(FULL);

// 진행 시뮬: 탐욕(가장 싼 다음 레벨 구매)
const m = HX.DEFAULT_BAL.meta;
let wallet = 0, ups = {}, runs = 0, owned = 0;
const milestones = [];
while (owned < totalLevels && runs < 2000) {
  runs++;
  const score = scoreNone + (scoreFull - scoreNone) * (owned / totalLevels); // <추정> 선형 보간
  const rate = m.convertBase + m.convertPerLv * Math.min(ups.convert || 0, UP.convert.max);
  wallet += Math.floor(score * rate);
  let bought = true;
  while (bought) {
    bought = false;
    const options = Object.entries(UP)
      .filter(([k, u]) => (ups[k] || 0) < u.max)
      .map(([k, u]) => ({ k, cost: u.cost[ups[k] || 0] }))
      .sort((a, b) => a.cost - b.cost);
    if (options.length && wallet >= options[0].cost) {
      wallet -= options[0].cost;
      ups[options[0].k] = (ups[options[0].k] || 0) + 1;
      owned++;
      milestones.push({ run: runs, bought: options[0].k, lv: ups[options[0].k] });
      bought = true;
    }
  }
}

console.log(`# meta-econ-sim — ${N} seeds/측정, cap ${CAP}턴\n`);
console.log(`무강화 평균 점수: ${scoreNone.toFixed(0)} · 풀강화 평균 점수: ${scoreFull.toFixed(0)} (점수 상승 ${((scoreFull / scoreNone - 1) * 100).toFixed(0)}%)`);
console.log(`전 노드 비용 합계: ${totalCost}코인 · 전환율 ${m.convertBase * 100}% → ${(m.convertBase + m.convertPerLv * UP.convert.max) * 100}%(전리품 만렙)`);
console.log(`\n**엔드리스 수입만으로 전 노드 해금: ${runs}런** (스테이지 코인 수입 병행 시 단축)`);
console.log('\n| 몇 런째 | 구매 | Lv |');
console.log('|---|---|---|');
for (const mm of milestones) console.log(`| ${mm.run} | ${UP[mm.bought].name} | ${mm.lv} |`);
