/* debug-boss.mjs — 브라우저(크로미엄)에서 보스 동작을 재현·진단한다.
 * shot.mjs와 같은 자급자족 HTML 부팅. 사용: node tools/debug-boss.mjs
 * 검사: (a) 콘솔/페이지 에러, (b) 깨끗한 localStorage에서 보스 틱 진행,
 *       (c) 에디터 오버라이드(hex_edit_*)가 있는 상태에서 보스 틱 진행.
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import babel from '@babel/standalone';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'Hex Danmaku.html'), 'utf8');
const cdnUrls = [...html.matchAll(/script src="(https:\/\/unpkg\.com\/[^"]+)"/g)].map(m => m[1])
  .filter(u => !u.includes('@babel/standalone'));
const jsxFiles = [...html.matchAll(/script type="text\/babel" src="([^"]+)"/g)].map(m => m[1]);
const cacheDir = join(root, 'tools', '.cdn-cache');
mkdirSync(cacheDir, { recursive: true });
const cachePath = (url) => join(cacheDir, url.replace(/[^a-z0-9.@-]+/gi, '_'));
for (const url of cdnUrls) {
  if (existsSync(cachePath(url))) continue;
  const res = await fetch(url);
  writeFileSync(cachePath(url), Buffer.from(await res.arrayBuffer()));
}
const transpiled = jsxFiles.map((f) => {
  const code = readFileSync(join(root, f), 'utf8');
  return `/* ${f} */\n(function(){\n` + babel.transform(code, { presets: ['react'], filename: f }).code + '\n})();';
});
const page1 = [
  '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8" /></head><body><div id="root"></div>',
  ...cdnUrls.map(u => `<script>\n${readFileSync(cachePath(u), 'utf8')}\n</script>`),
  `<script>\n${readFileSync(join(root, 'art-data.js'), 'utf8')}\n</script>`,
  ...transpiled.map(c => `<script>\n${c}\n</script>`),
  '</body></html>',
].join('\n');
const tmp = join(cacheDir, '_debug.html');
writeFileSync(tmp, page1);

const browser = await chromium.launch();

async function probe(label, initLS) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (initLS) await page.addInitScript((ls) => { for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v); }, initLS);
  await page.goto(pathToFileURL(tmp).href);
  await page.waitForTimeout(1500);
  const result = await page.evaluate(() => {
    try {
      const { HX, HXS } = window;
      const st = HXS.STAGES[5];
      const info = { id: st.id, bossTotal: st.bossTotal, phasesIsArray: Array.isArray(st.phases), phasesLen: st.phases && st.phases.length, hxbDash: !!(window.HXB && window.HXB.dash) };
      let s = HXS.initStage(5);
      const log = [];
      for (let i = 0; i < 6 && !s.ov; i++) {
        s = HX.tick(s, s.pl.r, s.pl.c);
        log.push(`t${s.t} bl=${s.bl.length} waves=${s.bossWaves} ln=${s.ln}`);
      }
      return { info, log };
    } catch (e) {
      return { crash: e.message, stack: (e.stack || '').split('\n').slice(0, 3).join(' | ') };
    }
  });
  console.log(`\n=== ${label} ===`);
  console.log('errors:', errors.length ? errors.slice(0, 5) : '없음');
  console.log(JSON.stringify(result, null, 1));
  await ctx.close();
}

// (b) 깨끗한 저장소
await probe('클린 localStorage');

// (c) 구버전 에디터 오버라이드 시뮬 — 보스 스테이지를 옛 정의(v 이전 phases)로 저장해뒀던 상황
const oldBossOverride = {
  overrides: {
    6: { id: 6, type: 'boss', name: 'BOSS · 파수꾼', sub: '공격을 견뎌라', interval: 2, bossTotal: 14,
         phases: [ { type: 'rain', n: 2, turns: 5, name: '산탄' }, { type: 'aimed', turns: 5, name: '조준 사격' }, { type: 'pincer', turns: 4, name: '협공' } ],
         tip: '보스의 모든 공격(HP)을 버텨내면 격파.' },
  },
  custom: [],
};
await probe('구버전 에디터 오버라이드(hex_edit_stages)', {
  hex_edit_stages: JSON.stringify(oldBossOverride),
  hex_edit_balance: JSON.stringify({ skill: { undoCost: 30 } }),
});

await browser.close();
