// balance-sim.mjs — 게임성 검증: 24 스테이지 몬테카를로 클리어율/턴 수 집계
// 봇: fairness.test의 2-ply 스마트 회피 + 목표 추구(포탈/별 방향 타이브레이크)
// 사용: node tools/balance-sim.mjs [seeds=30] [--json]
import { loadGame } from '../tests/harness.mjs';

const N = parseInt(process.argv[2], 10) || 30;
const asJson = process.argv.includes('--json');
const TURN_CAP = { normal: 80, collect: 80, survive: 60, boss: 120 };

function safeMoves(HX, s) {
  const opts = [{ r: s.pl.r, c: s.pl.c }, ...HX.D(s.pl.r).map(([dr, dc]) => ({ r: s.pl.r + dr, c: s.pl.c + dc }))];
  const res = [];
  for (const o of opts) {
    if (o.r < 0 || o.r >= HX.R || o.c < 0 || o.c >= HX.C) continue;
    const n = HX.tick(s, o.r, o.c);
    if (n !== s && !n.ov) res.push(n);
  }
  return res;
}

// 벽 인지 BFS 거리 (미로 스테이지에서 직선거리 휴리스틱은 벽에 막혀 오판)
function bfsDist(HX, s, from, to) {
  if (from.r === to.r && from.c === to.c) return 0;
  const key = (r, c) => r * 16 + c;
  const walls = new Set((s.walls || []).map(w => key(w.r, w.c)));
  const seen = new Set([key(from.r, from.c)]);
  let frontier = [[from.r, from.c]], d = 0;
  while (frontier.length) {
    const next = [];
    d++;
    for (const [r, c] of frontier) {
      for (const [dr, dc] of HX.D(r)) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= HX.R || nc < 0 || nc >= HX.C) continue;
        if (nr === to.r && nc === to.c) return d;
        const k = key(nr, nc);
        if (seen.has(k) || walls.has(k)) continue;
        seen.add(k);
        next.push([nr, nc]);
      }
    }
    frontier = next;
  }
  return 999; // 도달 불가
}

// 목표 좌표: normal=goal, collect=가장 가까운 별(BFS 기준), survive/boss=null(순수 회피)
function objectiveOf(HX, s) {
  const ty = s.obj && s.obj.type;
  if (ty === 'normal' && s.goal) return s.goal;
  if (ty === 'collect' && s.gems && s.gems.length) {
    let best = s.gems[0], bd = Infinity;
    for (const g of s.gems) {
      const d = bfsDist(HX, s, s.pl, g);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  }
  return null;
}

// 목표 우선(사람 플레이 근사): 2턴 생존 경로가 있는 수 중에서 목표에 가장 가까운 수.
// 진전 없이 오래 대치하면(stall) 1턴 안전만 보고 위험을 감수한다 — 벽에 낀 별 옆에서
// 2턴 안전 창이 영원히 안 열리는 교착을 사람처럼 리스크 테이킹으로 푼다.
const STALL_LIMIT = 10;
function bestNext(HX, s, stall = 0) {
  const moves = safeMoves(HX, s);
  if (!moves.length) return null;
  const winner = moves.find(n => n.win);
  if (winner) return winner; // 클리어 수는 즉시 선택 (win 상태는 tick이 멈춰 survivable=0으로 보임)
  const goal = objectiveOf(HX, s);
  const scored = moves.map(n => {
    const followups = safeMoves(HX, n);
    const survivable = followups.filter(m => m.win || safeMoves(HX, m).length > 0).length;
    return { n, survivable, breadth: followups.length, dist: goal ? bfsDist(HX, s, n.pl, goal) : 0 };
  });
  const alive = scored.filter(x => x.survivable > 0);
  const pool = (alive.length && stall < STALL_LIMIT) ? alive : scored;
  pool.sort((a, b) => a.dist - b.dist || b.survivable - a.survivable || b.breadth - a.breadth);
  return pool[0].n;
}

function runStage(idx, seed) {
  const { HX, HXS } = loadGame({ seed });
  let s = HXS.initStage(idx);
  const cap = TURN_CAP[s.obj && s.obj.type] || 80;
  // stall(위험 감수)은 collect 전용 — 벽에 낀 별 옆 교착만 해소.
  // normal은 후퇴가 정상 플레이라 stall을 걸면 위험 모드가 오발동해 사망이 늘어난다.
  const isCollect = s.obj && s.obj.type === 'collect';
  let stall = 0, lastGems = s.gems ? s.gems.length : null;
  while (!s.ov && !s.win && s.t < cap) {
    const n = bestNext(HX, s, isCollect ? stall : 0);
    if (!n) break; // 안전 수 없음 = 사망 확정
    if (isCollect) {
      const g = n.gems ? n.gems.length : null;
      stall = (g !== null && g < lastGems) ? 0 : stall + 1;
      if (g !== null) lastGems = g;
    }
    s = n;
  }
  return { win: !!s.win, dead: !!s.ov || (!s.win && s.t < cap), turns: s.t, timeout: !s.win && !s.ov && s.t >= cap };
}

const { HXS } = loadGame({ seed: 1 });
const total = HXS.STAGES.length;
const rows = [];
const t0 = Date.now();
for (let idx = 0; idx < total; idx++) {
  const st = HXS.STAGES[idx];
  let wins = 0, deaths = 0, timeouts = 0, winTurns = 0, deathTurns = 0;
  for (let seed = 1; seed <= N; seed++) {
    const r = runStage(idx, seed);
    if (r.win) { wins++; winTurns += r.turns; }
    else if (r.timeout) timeouts++;
    else { deaths++; deathTurns += r.turns; }
  }
  rows.push({
    idx, id: st.id, name: st.name, type: st.type,
    clearRate: wins / N,
    avgWinTurns: wins ? +(winTurns / wins).toFixed(1) : null,
    avgDeathTurn: deaths ? +(deathTurns / deaths).toFixed(1) : null,
    deaths, timeouts,
  });
  process.stderr.write(`stage ${st.id} done (${Date.now() - t0}ms)\n`);
}

if (asJson) {
  console.log(JSON.stringify({ seedsPerStage: N, rows }, null, 2));
} else {
  console.log(`# balance-sim — ${N} seeds/stage, smart-dodge+objective bot (2-ply)\n`);
  console.log('| # | 이름 | 타입 | 클리어율 | 평균클리어턴 | 평균사망턴 | 사망 | 타임아웃 |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    console.log(`| ${r.id} | ${r.name} | ${r.type} | ${(r.clearRate * 100).toFixed(0)}% | ${r.avgWinTurns ?? '-'} | ${r.avgDeathTurn ?? '-'} | ${r.deaths} | ${r.timeouts} |`);
  }
  const tier = (a, b) => {
    const rs = rows.slice(a, b);
    return (rs.reduce((s, r) => s + r.clearRate, 0) / rs.length * 100).toFixed(0);
  };
  console.log(`\n티어 평균 클리어율: 1-8=${tier(0, 8)}% · 9-16=${tier(8, 16)}% · 17-24=${tier(16, 24)}%`);
  const spikes = rows.filter(r => r.clearRate < 0.1);
  if (spikes.length) console.log(`급사 플래그(<10%): ${spikes.map(r => `#${r.id} ${r.name}`).join(', ')}`);
  const trivial = rows.filter((r, i) => i >= 8 && r.clearRate === 1);
  if (trivial.length) console.log(`무긴장 플래그(중후반 100%): ${trivial.map(r => `#${r.id} ${r.name}`).join(', ')}`);
}
