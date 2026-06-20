/* shot.mjs — 게임을 헤드리스로 띄워 화면별 스크린샷을 찍는다.
 * 사용: node tools/shot.mjs [outDir]   (기본 assets/extracted/shots)
 * 선행: npm install --no-save playwright @babel/standalone && npx playwright install chromium
 *
 * 헤드리스 크로미엄이 외부 CDN(unpkg)에 못 나가는 환경이 있어 서버/네트워크를
 * 아예 쓰지 않는다: JSX를 node에서 미리 트랜스파일하고, 한 번 받아 둔 React UMD와
 * 함께 자급자족 HTML(tools/.cdn-cache/_shot.html)로 합쳐 file:// 로 연다. */
import { chromium } from 'playwright';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import babel from '@babel/standalone';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || 'assets/extracted/shots';
mkdirSync(out, { recursive: true });

// ── 원본 HTML에서 CDN 스크립트 URL + JSX 로드 순서를 그대로 읽는다 ──
const html = readFileSync(join(root, 'Hex Danmaku.html'), 'utf8');
const cdnUrls = [...html.matchAll(/script src="(https:\/\/unpkg\.com\/[^"]+)"/g)].map(m => m[1])
  .filter(u => !u.includes('@babel/standalone')); // babel은 node에서 돌리므로 불필요
const jsxFiles = [...html.matchAll(/script type="text\/babel" src="([^"]+)"/g)].map(m => m[1]);

const cacheDir = join(root, 'tools', '.cdn-cache');
mkdirSync(cacheDir, { recursive: true });
const cachePath = (url) => join(cacheDir, url.replace(/[^a-z0-9.@-]+/gi, '_'));
for (const url of cdnUrls) {
  if (existsSync(cachePath(url))) continue;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CDN fetch failed ${res.status}: ${url}`);
  writeFileSync(cachePath(url), Buffer.from(await res.arrayBuffer()));
  console.log('cached', url);
}

// ── JSX → JS 트랜스파일 후 자급자족 HTML 조립 ──
// 브라우저 babel(text/babel)은 스크립트마다 별도 스코프 — 일반 <script>로 합칠 때는
// IIFE로 감싸 전역 const 충돌을 막는다 (파일 간 공유는 어차피 window.* 명시적).
const transpiled = jsxFiles.map((f) => {
  const code = readFileSync(join(root, f), 'utf8');
  return `/* ${f} */\n(function(){\n` + babel.transform(code, { presets: ['react'], filename: f }).code + '\n})();';
});
const page1 = [
  '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8" />',
  '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
  // 외부 폰트 @import는 오프라인 크로미엄에서 행을 유발 → 제거(폴백 폰트로 충분)
  `<style>\n${readFileSync(join(root, 'styles.css'), 'utf8').replace(/@import[^;]+;/g, '')}\n</style>`,
  '</head><body><div id="root"></div>',
  ...cdnUrls.map(u => `<script>\n${readFileSync(cachePath(u), 'utf8')}\n</script>`),
  `<script>\n${readFileSync(join(root, 'art-data.js'), 'utf8')}\n</script>`,
  ...transpiled.map(c => `<script>\n${c}\n</script>`),
  '</body></html>',
].join('\n');
const shotHtml = join(cacheDir, '_shot.html');
writeFileSync(shotHtml, page1);

// ── 촬영 ──
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 480, height: 860 } });
page.on('pageerror', (e) => console.log('pageerror:', String(e).split('\n')[0]));
await page.goto(pathToFileURL(shotHtml).href, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('button', { timeout: 30000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/01-menu.png` });

// 엔드리스 = 즉시 인게임 보드 (스프라이트 합성 확인용)
const click = async (re) => {
  const b = page.locator('button', { hasText: re }).first();
  if (!(await b.count())) return false;
  await b.click();
  await page.waitForTimeout(900);
  return true;
};
if (await click(/엔드리스/)) {
  // 몇 턴 진행해 탄막/소환이 보드에 깔린 상태를 찍는다 (a/d = 좌우 이동)
  for (const k of ['a', 'd', 'a', 'd', 'a', 'd', 'a', 'd']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(260);
  }
  await page.screenshot({ path: `${out}/02-endless.png` });
}

// 스테이지 셀렉터 → 첫 스테이지 보드
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('button', { timeout: 30000 });
if (await click(/스테이지/)) {
  await page.screenshot({ path: `${out}/03-stage-select.png` });
  const cards = page.locator('button').filter({ hasText: /1/ });
  if (await cards.count()) {
    await cards.first().click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/04-stage1.png` });
  }
}
await browser.close();
console.log(`screenshots -> ${out}`);
