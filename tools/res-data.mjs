/* res-data.mjs — art-data.js(순수 데이터)를 평가해 RES를 돌려준다. */
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function loadRES() {
  const src = readFileSync(join(root, 'art-data.js'), 'utf8');
  const win = {};
  new Function('window', src)(win); // art-data.js가 window.HXR_DATA = { RES } 할당
  if (!win.HXR_DATA || !win.HXR_DATA.RES) throw new Error('art-data.js did not set window.HXR_DATA.RES');
  return win.HXR_DATA.RES;
}
