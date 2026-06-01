import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Mulberry32 — deterministic PRNG so Math.random is reproducible in tests
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Load engine.jsx + stages.jsx into one sandboxed context.
// They are pure JS (no JSX/React); they only touch `window`.
export function loadGame({ seed = 1 } = {}) {
  const win = {};
  const sandboxMath = Object.create(Math); // inherits sqrt/floor/PI..., own random
  sandboxMath.random = makeRng(seed);
  const sandbox = { window: win, Math: sandboxMath, console };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of ['engine.jsx', 'stages.jsx']) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    // Wrap in IIFE so top-level `const` declarations from each file don't
    // collide with each other in the shared vm context global scope.
    vm.runInContext(`(function(){\n${src}\n})();`, ctx, { filename: f });
  }
  return {
    HX: win.HX,
    HXS: win.HXS,
    setSeed: (s) => { sandboxMath.random = makeRng(s); },
  };
}

// Minimal full game state for tick() tests — override what you need.
export function baseState(HX, over = {}) {
  return { ...HX.initState(), ...over };
}

// Normalize a vm-sandbox value into a host-realm plain value (JSON round-trip).
// Use for structural comparisons: `assert.deepEqual(plain(n.bl[0]), { r: 6, c: 4 })`.
// The sandbox is a separate realm, so deepStrictEqual on raw sandbox objects/arrays
// fails on prototype identity even when contents match. Do NOT use plain() for
// identity checks like `assert.equal(n, s)` — wrapping would break reference equality.
export const plain = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
