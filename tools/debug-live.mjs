/* debug-live.mjs — 유저와 동일 경로(http://localhost + CDN Babel + text/babel)로 재현.
 * 선행: npx serve -l 4173 .   사용: node tools/debug-live.mjs [url]
 */
import { chromium } from 'playwright';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.argv[2] || 'http://localhost:4173/Hex%20Danmaku.html';
const cacheDir = join(resolve(dirname(fileURLToPath(import.meta.url))), '.cdn-cache');

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 480, height: 900 } })).newPage();
const logs = [];
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ` + m.text().slice(0, 300)); });
page.on('requestfailed', (r) => logs.push('[reqfail] ' + r.url().slice(0, 120)));

await page.addInitScript(() => {
  const stars = {}; for (let i = 1; i <= 24; i++) stars[i] = 1;
  localStorage.setItem('hex_stage_stars', JSON.stringify(stars));
});
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(6000); // CDN babel 컴파일 대기
await page.screenshot({ path: join(cacheDir, 'live-0-boot.png') });

const click = async (re) => {
  const b = page.locator('button', { hasText: re }).first();
  if (!(await b.count())) { console.log('버튼 없음:', re); return false; }
  await b.click(); await page.waitForTimeout(600); return true;
};

// 보스 진입 → 10턴 대기 입력
if (await click(/스테이지/)) {
  await click(/여명의 평원/);
  await click(/파수꾼/);
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(cacheDir, 'live-1-enter.png') });
  for (let i = 0; i < 10; i++) { await page.keyboard.press(' '); await page.waitForTimeout(200); }
  await page.screenshot({ path: join(cacheDir, 'live-2-after10.png') });
  const hud = await page.evaluate(() =>
    (document.querySelector('.stage-hud') || document.body).innerText.slice(0, 140).replace(/\n/g, ' | '));
  console.log('HUD:', hud);
}
console.log('로그:', logs.length ? logs.slice(0, 12) : '없음');
await browser.close();
