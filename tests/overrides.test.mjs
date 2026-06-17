import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEditor, plain } from './harness.mjs';

test('buildBalance merges patch over DEFAULT_BAL', () => {
  const { HXE, HX } = loadEditor();
  const b = HXE.buildBalance({ skill: { bombCost: 99 } });
  assert.equal(b.skill.bombCost, 99);
  assert.equal(b.skill.undoCost, HX.DEFAULT_BAL.skill.undoCost); // untouched
});

// #9: clearing a slider's number input yields Number('') === 0. chaseEvery:0 makes the engine
// compute `t % 0` === NaN (chasers freeze forever); lungeDash:0 makes the dash a no-op. Clamp the
// engine-timing fields to a safe minimum so a bad value can never corrupt the run.
test('buildBalance clamps engine-breaking timing fields to >= 1', () => {
  const { HXE } = loadEditor();
  assert.ok(HXE.buildBalance({ enemy: { chaseEvery: 0 } }).enemy.chaseEvery >= 1);
  assert.ok(HXE.buildBalance({ enemy: { chaseEvery: NaN } }).enemy.chaseEvery >= 1);
  assert.ok(HXE.buildBalance({ enemy: { lungeDash: 0 } }).enemy.lungeDash >= 1);
});

test('applyStageOverrides merges by id and appends custom', () => {
  const { HXE } = loadEditor();
  const base = [{ id: 1, name: 'A', interval: 2 }, { id: 2, name: 'B', interval: 2 }];
  const out = HXE.applyStageOverrides(base, {
    overrides: { 2: { name: 'B!' } },
    custom: [{ id: 1000, name: 'Custom' }],
  });
  assert.equal(out[0].name, 'A');
  assert.equal(out[1].name, 'B!');
  assert.equal(out[2].id, 1000);
});

test('applyResOverrides patches one entry, keeps others', () => {
  const { HXE } = loadEditor();
  const base = { player: { px: 2.4 }, drone: { px: 2.3 } };
  const out = HXE.applyResOverrides(base, { player: { px: 3 } });
  assert.equal(out.player.px, 3);
  assert.equal(out.drone.px, 2.3);
});

test('serialize -> parse round-trips', () => {
  const { HXE } = loadEditor({ initialLS: {
    hex_edit_balance: { skill: { freezeCost: 70 } },
    hex_edit_stages: { overrides: { 1: { name: 'X' } }, custom: [] },
  } });
  const json = HXE.serializeOverrides();
  const parsed = HXE.parseOverrides(json);
  assert.equal(parsed.balance.skill.freezeCost, 70);
  assert.equal(parsed.stages.overrides[1].name, 'X');
});

test('parseOverrides rejects malformed JSON and bad schema', () => {
  const { HXE } = loadEditor();
  assert.throws(() => HXE.parseOverrides('{not json'));
  assert.throws(() => HXE.parseOverrides(JSON.stringify({ stages: { custom: 'nope' } })));
});

// #5: arrays pass `typeof x === 'object'`, so a malformed array slips through validation and
// silently corrupts state (e.g. balance:[] turns window.HXB into an array → bal().skill crashes).
test('parseOverrides rejects array-valued sections', () => {
  const { HXE } = loadEditor();
  assert.throws(() => HXE.parseOverrides(JSON.stringify({ stages: [] })), /stages/);
  assert.throws(() => HXE.parseOverrides(JSON.stringify({ stages: { overrides: [], custom: [] } })), /stages/);
  assert.throws(() => HXE.parseOverrides(JSON.stringify({ balance: [] })), /balance/);
  assert.throws(() => HXE.parseOverrides(JSON.stringify({ res: [] })), /res/);
});

test('importOverrides applies balance to window.HXB', () => {
  const { HXE, win } = loadEditor();
  HXE.importOverrides(JSON.stringify({ balance: { skill: { bombCost: 5 } } }));
  assert.equal(win.HXB.skill.bombCost, 5);
});

test('applyOverrides mutates STAGES in place (custom appended on load)', () => {
  const { HXS } = loadEditor({ initialLS: {
    hex_edit_stages: { overrides: {}, custom: [{ id: 1000, type: 'survive', name: 'C', interval: 2, surviveTurns: 5 }] },
  } });
  assert.ok(HXS.STAGES.some(s => s.id === 1000));
});

test('validateStage returns a {ok, warnings} shape', () => {
  const { HXE } = loadEditor();
  const def = { id: 1000, type: 'survive', name: 'box', interval: 99, surviveTurns: 20,
    pool: [], walls: [{ r: 10, c: 2 }, { r: 10, c: 4 }, { r: 9, c: 2 }, { r: 9, c: 3 }] };
  const res = HXE.validateStage(def, { turns: 5 });
  assert.ok(typeof res.ok === 'boolean' && Array.isArray(res.warnings));
});

// #10: validateStage must dodge at least as well as the fairness test (2-ply lookahead +
// multiple internal trials), or it false-warns on stages that are actually fair. A single
// 1-ply greedy playthrough corners itself on RNG pools and flags shipped fair stages.
test('validateStage does not false-warn on shipped reworked stages', () => {
  const reworked = [5, 8, 10, 11, 12, 19];
  for (let seed = 1; seed <= 5; seed++) {
    const { HXS, HXE } = loadEditor({ seed });
    for (const id of reworked) {
      const def = HXS.STAGES.find(s => s.id === id);
      const res = HXE.validateStage(def);
      assert.ok(res.ok, `id ${id} seed ${seed} should be fair: ${res.warnings[0]}`);
    }
  }
});

test('buildBalance merges coin section and clamps negatives to 0', () => {
  const { HXE, HX } = loadEditor();
  const b = plain(HXE.buildBalance({ coin: { clearPerStar: -10, pickupValue: 7 } }));
  assert.equal(b.coin.clearPerStar, 0);
  assert.equal(b.coin.pickupValue, 7);
  assert.equal(b.coin.repeatPerStar, 5);   // unspecified key keeps default
});

test('buildBalance clamps negative skill coin fields to 0, keeps unaffected defaults', () => {
  const { HXE, HX } = loadEditor();
  const b = plain(HXE.buildBalance({ skill: { undoCoin: -5 } }));
  assert.equal(b.skill.undoCoin, 0);
  assert.equal(b.skill.bombCoin, HX.DEFAULT_BAL.skill.bombCoin); // default kept (30)
});

test('buildBalance merges boss section and clamps negatives to 0', () => {
  const { HXE, HX } = loadEditor();
  const b = plain(HXE.buildBalance({ boss: { bombsPerWave: -3, bombLife: 4 } }));
  assert.equal(b.boss.bombsPerWave, 0);
  assert.equal(b.boss.bombLife, 4);
  assert.equal(b.boss.bombTelegraph, 1); // unspecified key keeps default
});

test('validateStage flags a genuinely unfair stage (full-width volley)', () => {
  const { HXE } = loadEditor({ seed: 1 });
  const def = { id: 9999, type: 'survive', surviveTurns: 30, interval: 1, firstDelay: 0,
    pool: [{ n: '전열', c: [0, 1, 2, 3, 4, 5, 6] }], start: { r: 8, c: 3 },
    walls: [], enemies: [], gems: [], cracks: [], pads: [], spikes: [], turrets: [] };
  const res = HXE.validateStage(def);
  assert.equal(res.ok, false);
});
