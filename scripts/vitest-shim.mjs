// scripts/vitest-shim.mjs
// Minimal stand-in for the `vitest` API so src/lib/wiring/harness.test.ts can
// be run under plain Node (no test runner is installed). Bundled in via
// `esbuild --alias:vitest=./scripts/vitest-shim.mjs`.
let passed = 0;
let failed = 0;
const stack = [];

export function describe(name, fn) {
  stack.push(name);
  fn();
  stack.pop();
}

export function it(name, fn) {
  const label = [...stack, name].join(' › ');
  try {
    fn();
    passed++;
    console.log('  ✓ ' + label);
  } catch (err) {
    failed++;
    console.error('  ✗ ' + label);
    console.error('    ' + (err && err.message ? err.message : String(err)));
  }
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === 'object') {
    const ak = Object.keys(a), bk = Object.keys(b);
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (ak.length !== bk.length) return false;
    return ak.every(k => deepEqual(a[k], b[k]));
  }
  return false;
}

export function expect(actual) {
  // `negate` flips every matcher so `expect(x).not.toBe(y)` works too.
  const matchers = (negate) => ({
    toEqual(expected) {
      if (deepEqual(actual, expected) === negate) {
        throw new Error('Expected ' + (negate ? 'not ' : '') + JSON.stringify(expected) + ' got ' + JSON.stringify(actual));
      }
    },
    toBe(expected) {
      if ((actual === expected) === negate) {
        throw new Error('Expected ' + (negate ? 'not ' : '') + JSON.stringify(expected) + ' got ' + JSON.stringify(actual));
      }
    },
    toHaveLength(n) {
      if ((!!actual && actual.length === n) === negate) {
        throw new Error('Expected length ' + (negate ? '!= ' : '') + n + ' got ' + (actual ? actual.length : 'undefined'));
      }
    },
    toBeCloseTo(expected, digits = 2) {
      const tol = Math.pow(10, -digits) / 2;
      if ((Math.abs(actual - expected) <= tol) === negate) {
        throw new Error('Expected ' + (negate ? 'not ' : '') + expected + ' (±' + tol + ') got ' + actual);
      }
    },
    toBeUndefined() {
      if ((actual === undefined) === negate) {
        throw new Error('Expected ' + (negate ? 'defined' : 'undefined') + ' got ' + JSON.stringify(actual));
      }
    },
    toBeDefined() {
      if ((actual !== undefined) === negate) {
        throw new Error('Expected ' + (negate ? 'undefined' : 'defined') + ' got ' + JSON.stringify(actual));
      }
    },
    toBeGreaterThan(expected) {
      if ((actual > expected) === negate) {
        throw new Error('Expected ' + (negate ? 'not ' : '') + '> ' + expected + ' got ' + actual);
      }
    },
    toBeLessThan(expected) {
      if ((actual < expected) === negate) {
        throw new Error('Expected ' + (negate ? 'not ' : '') + '< ' + expected + ' got ' + actual);
      }
    },
    toBeGreaterThanOrEqual(expected) {
      if ((actual >= expected) === negate) {
        throw new Error('Expected ' + (negate ? 'not ' : '') + '>= ' + expected + ' got ' + actual);
      }
    },
    toBeLessThanOrEqual(expected) {
      if ((actual <= expected) === negate) {
        throw new Error('Expected ' + (negate ? 'not ' : '') + '<= ' + expected + ' got ' + actual);
      }
    },
  });
  const base = matchers(false);
  base.not = matchers(true);
  return base;
}

// Print a summary and set the exit code when the bundle finishes executing.
process.on('exit', () => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
});
