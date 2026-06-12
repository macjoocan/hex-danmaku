/* res-data.mjs — resources.jsx의 순수 JS 구간(그리드/맵/RES)을 평가해 RES를 돌려준다.
 * resources.jsx는 브라우저 전역 JSX 모듈이라 import 불가 — 마커 사이를 잘라 평가한다. */
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function loadRES() {
  const src = readFileSync(join(root, 'resources.jsx'), 'utf8');
  const start = src.indexOf('// ─── Pixel grids');
  const end = src.indexOf('// ─── drawArt');
  if (start < 0 || end < 0) throw new Error('resources.jsx markers not found — file layout changed?');
  return new Function(`${src.slice(start, end)}; return RES;`)();
}
