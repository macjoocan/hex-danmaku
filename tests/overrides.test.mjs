import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEditor } from './harness.mjs';

test('buildBalance merges patch over DEFAULT_BAL', () => {
  const { HXE, HX } = loadEditor();
  const b = HXE.buildBalance({ skill: { bombCost: 99 } });
  assert.equal(b.skill.bombCost, 99);
  assert.equal(b.skill.undoCost, HX.DEFAULT_BAL.skill.undoCost); // untouched
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
