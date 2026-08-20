/* debug-boss-ui.mjs — 실제 UI 플로우로 보스전 진입해 동작 확인 + 스크린샷.
 * 사용: node tools/debug-boss-ui.mjs   (스크린샷: tools/.cdn-cache/boss-*.png)
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
  '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8" />',
  `<style>\n${readFileSync(join(root, 'styles.css'), 'utf8').replace(/@import[^;]+;/g, '')}\n</style>`,
  '</head><body><div id="root"></div>',
  ...cdnUrls.map(u => `<script>\n${readFileSync(cachePath(u), 'utf8')}\n</script>`),
  `<script>\n${readFileSync(join(root, 'art-data.js'), 'utf8')}\n</script>`,
  ...transpiled.map(c => `<script>\n${c}\n</script>`),
  '</body></html>',
].join('\n');
const tmp = join(cacheDir, '_debug_ui.html');
writeFileSync(tmp, page1);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 480, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
// 전 스테이지 해금
await page.addInitScript(() => {
  const stars = {}; for (let i = 1; i <= 24; i++) stars[i] = 1;
  localStorage.setItem('hex_stage_stars', JSON.stringify(stars));
});
await page.goto(pathToFileURL(tmp).href);
await page.waitForSelector('button', { timeout: 30000 });

const click = async (re) => {
  const b = page.locator('button', { hasText: re }).first();
  if (!(await b.count())) { console.log('버튼 못 찾음:', re); return false; }
  await b.click(); await page.waitForTimeout(600); return true;
};
const BOSSES = [
  { region: /여명의 평원/, boss: /파수꾼/ },
  { region: /강철 전선/, boss: /포격수/ },
  { region: /군주의 성채/, boss: /군주/ },
  { region: /포식의 둥지/, boss: /포식자/ },
  { region: /심연/, boss: /심연/ },
];
for (let bi = 0; bi < BOSSES.length; bi++) {
  const { region, boss } = BOSSES[bi];
  await page.goto(pathToFileURL(tmp).href);
  await page.waitForSelector('button', { timeout: 30000 });
  errors.length = 0;
  await click(/스테이지/);
  await click(region);
  if (!(await click(boss))) { console.log(`[${bi}] 진입 실패`); continue; }
  await page.waitForTimeout(500);
  for (let i = 0; i < 10; i++) { await page.keyboard.press(' '); await page.waitForTimeout(200); }
  await page.screenshot({ path: join(cacheDir, `boss-ui-${bi}.png`) });
  const hud = await page.evaluate(() =>
    (document.querySelector('.stage-hud') || document.body).innerText.slice(0, 120).replace(/\n/g, ' | '));
  console.log(`[보스 ${bi}]`, errors.length ? '에러: ' + errors.slice(0, 2).join(' / ') : 'JS에러 없음', '| HUD:', hud);
}
await browser.close();
