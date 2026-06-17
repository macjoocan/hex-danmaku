import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRES } from '../tools/res-data.mjs';

const RES = loadRES();
const pixels = Object.entries(RES).filter(([, e]) => e.kind === 'pixel');

// 리스킨이 끝난 키만 여기 추가한다 (스펙: 16×16, 히어로만 16×20)
const EXPECTED_SIZE = {
  player: [16, 20],
  drone: [16, 16], droneFz: [16, 16], chaser: [16, 16],
  bouncer: [16, 16], lunger: [16, 16], turret: [16, 16],
  star: [16, 16], bomb: [16, 16], tp: [16, 16], hint: [16, 16], gem: [16, 16],
  portal: [16, 16], spike: [16, 16], pad: [16, 16],
  mine: [16, 16], beam: [16, 16], explode: [16, 16],
  coin: [16, 16],
  bombZone: [16, 16],
};

test('every pixel grid is rectangular', () => {
  for (const [name, e] of pixels) {
    const w = e.grid[0].length;
    e.grid.forEach((row, i) => assert.equal(row.length, w, `${name} row ${i}: ${row.length} != ${w}`));
  }
});

test('every painted char has a map color', () => {
  for (const [name, e] of pixels) {
    for (const row of e.grid) {
      for (const ch of row) {
        if (ch === '.' || ch === ' ') continue;
        assert.ok(e.map[ch], `${name}: "${ch}" has no color in map`);
      }
    }
  }
});

test('reskinned grids have spec dimensions', () => {
  for (const [name, [w, h]] of Object.entries(EXPECTED_SIZE)) {
    assert.equal(RES[name].grid[0].length, w, `${name} width`);
    assert.equal(RES[name].grid.length, h, `${name} height`);
  }
});
