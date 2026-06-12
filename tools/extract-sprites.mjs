/* extract-sprites.mjs — dump every pixel-art entry in resources.jsx to PNG.
 *
 * Usage:  node tools/extract-sprites.mjs [outDir] [scale]
 *   outDir  default: assets/extracted
 *   scale   default: 16  (each art pixel becomes a scale×scale block; a 1x
 *           true-size copy is also written under <outDir>/1x)
 *
 * resources.jsx is not an ES module (browser-global JSX), so we slice out the
 * pure-JS section between the grid definitions and drawArt() and evaluate it.
 * Vector entries (wall, crack) have no pixel grid and are skipped.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, process.argv[2] || 'assets/extracted');
const scale = Math.max(1, parseInt(process.argv[3] || '16', 10));

// ── pull the grid/map/RES literals out of resources.jsx ──
const src = readFileSync(join(root, 'resources.jsx'), 'utf8');
const start = src.indexOf('// ─── Pixel grids');
const end = src.indexOf('// ─── drawArt');
if (start < 0 || end < 0) throw new Error('resources.jsx markers not found — file layout changed?');
const section = src.slice(start, end);
const RES = new Function(`${section}; return RES;`)();

// ── minimal PNG encoder (RGBA8, no deps) ──
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const encodePNG = (w, h, rgba) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

const hexToRGBA = (css) => {
  const m = /^#([0-9a-f]{6})$/i.exec(css.trim());
  if (!m) throw new Error(`unsupported color "${css}" (expected #rrggbb)`);
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff, 255];
};

const renderGrid = (grid, map, s) => {
  const gw = grid[0].length, gh = grid.length;
  const w = gw * s, h = gh * s;
  const rgba = Buffer.alloc(w * h * 4); // transparent default
  grid.forEach((row, r) => row.split('').forEach((ch, c) => {
    if (ch === ' ' || ch === '.') return;
    const color = map[ch];
    if (!color) return;
    const [R, G, B, A] = hexToRGBA(color);
    for (let dy = 0; dy < s; dy++) {
      let o = ((r * s + dy) * w + c * s) * 4;
      for (let dx = 0; dx < s; dx++) { rgba[o++] = R; rgba[o++] = G; rgba[o++] = B; rgba[o++] = A; }
    }
  }));
  return { w, h, png: encodePNG(w, h, rgba) };
};

mkdirSync(join(outDir, '1x'), { recursive: true });
const rows = [];
for (const [name, entry] of Object.entries(RES)) {
  if (entry.kind !== 'pixel') { rows.push({ name, note: `skipped (${entry.kind})` }); continue; }
  const big = renderGrid(entry.grid, entry.map, scale);
  const one = renderGrid(entry.grid, entry.map, 1);
  writeFileSync(join(outDir, `${name}.png`), big.png);
  writeFileSync(join(outDir, '1x', `${name}.png`), one.png);
  rows.push({ name, note: `${one.w}x${one.h} → ${big.w}x${big.h}` });
}
for (const { name, note } of rows) console.log(`${name.padEnd(8)} ${note}`);
console.log(`\nwrote PNGs to ${outDir} (preview @${scale}x) and ${join(outDir, '1x')} (true size)`);
