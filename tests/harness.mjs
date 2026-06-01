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

// Load engine + stages + a stubbed HXR.RES + editor-core, with a fake localStorage.
// resources.jsx contains JSX so it can't run in plain vm; editor-core only needs RES as data.
export function loadEditor({ seed = 1, initialLS = {} } = {}) {
  const win = {};
  const sandboxMath = Object.create(Math);
  sandboxMath.random = makeRng(seed);
  const store = new Map(Object.entries(initialLS).map(([k, v]) => [k, JSON.stringify(v)]));
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
  };
  const sandbox = { window: win, Math: sandboxMath, console, localStorage };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of ['engine.jsx', 'stages.jsx']) {
    vm.runInContext(`(function(){\n${readFileSync(join(ROOT, f), 'utf8')}\n})();`, ctx, { filename: f });
  }
  win.HXR = { RES: { player: { kind: 'pixel', px: 2.4 }, drone: { kind: 'pixel', px: 2.3 } } };
  vm.runInContext(`(function(){\n${readFileSync(join(ROOT, 'editor-core.jsx'), 'utf8')}\n})();`, ctx, { filename: 'editor-core.jsx' });
  return { HX: win.HX, HXS: win.HXS, HXR: win.HXR, HXE: win.HXE, win, store };
}
