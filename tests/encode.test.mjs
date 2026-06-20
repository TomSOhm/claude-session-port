// tests/encode.test.mjs
//
// encodeCwd is pure (no platform reads), so the same assertions run identically on
// every CI OS. Each non-alphanumeric char becomes its OWN '-' (no run-collapsing),
// mirroring Claude Code's `-replace '[^A-Za-z0-9]','-'`.

import test from 'node:test';
import assert from 'node:assert/strict';

import { encodeCwd } from '../scripts/core/encode.mjs';

test('encodeCwd: Windows path -> drive colon + each backslash become a dash', () => {
  // 'C:\\Users\\you\\my-app' : ':' -> '-', each '\\' -> '-', '-' in 'my-app' stays '-'.
  assert.equal(encodeCwd('C:\\Users\\you\\my-app'), 'C--Users-you-my-app');
});

test('encodeCwd: macOS path -> leading slash becomes a dash', () => {
  assert.equal(encodeCwd('/Users/you/my-app'), '-Users-you-my-app');
});

test('encodeCwd: Linux path -> leading slash becomes a dash', () => {
  assert.equal(encodeCwd('/home/you/my-app'), '-home-you-my-app');
});

test('encodeCwd: every non-alphanumeric maps to its own dash (no collapsing)', () => {
  // Two consecutive separators (':' then '\\') yield TWO dashes, not one.
  assert.equal(encodeCwd('C:\\X'), 'C--X');
  // A dotted folder keeps a dash per dot.
  assert.equal(encodeCwd('a.b.c'), 'a-b-c');
  // Spaces are non-alphanumeric too.
  assert.equal(encodeCwd('my app'), 'my-app');
});

test('encodeCwd: alphanumerics are preserved verbatim', () => {
  assert.equal(encodeCwd('abcXYZ123'), 'abcXYZ123');
});

test('encodeCwd: coerces non-string input via String()', () => {
  assert.equal(encodeCwd(123), '123');
});
