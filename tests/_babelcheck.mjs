// Dev-only JSX syntax validator (NOT a test; not committed).
// Requires: npm install --no-save @babel/standalone
// Run: node tests/_babelcheck.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Babel = require('@babel/standalone');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const files = readdirSync(ROOT).filter(f => f.endsWith('.jsx'));
let ok = 0, fail = 0;
for (const f of files) {
  try {
    Babel.transform(readFileSync(join(ROOT, f), 'utf8'), { presets: ['react'], filename: f });
    console.log('✓', f);
    ok++;
  } catch (e) {
    console.log('✗', f, '\n  ', e.message.split('\n')[0]);
    fail++;
  }
}
console.log(`\n${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
