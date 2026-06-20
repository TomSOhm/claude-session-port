// tests/remap.test.mjs
//
// tokenizeHome (export side) replaces the source home prefix with ${CSP_HOME};
// detokenizeHome (import side) swaps ${CSP_HOME} for the destination home. Both are
// pure string ops, so we can simulate any source/target OS pairing on one runner.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  tokenizeHome,
  detokenizeHome,
  HOME_TOKEN,
} from '../scripts/core/remap.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) =>
  readFileSync(path.join(here, 'fixtures', name), 'utf8');

test('tokenizeHome replaces every occurrence of the source home (more than once)', () => {
  const text = '/Users/alice path A and /Users/alice path B';
  const out = tokenizeHome(text, '/Users/alice');
  assert.equal(out, `${HOME_TOKEN} path A and ${HOME_TOKEN} path B`);
  // No literal home left behind.
  assert.ok(!out.includes('/Users/alice'));
});

test('round-trip: macOS home -> token -> Linux home (cross-OS swap)', () => {
  const src = '/Users/alice/app/run.log and again /Users/alice/app/x';
  const tokenized = tokenizeHome(src, '/Users/alice');
  // Detokenize to a DIFFERENT home (Linux), as on a different target machine.
  const landed = detokenizeHome(tokenized, '/home/bob');
  assert.equal(landed, '/home/bob/app/run.log and again /home/bob/app/x');
});

test('round-trip: macOS home -> token -> Windows home (cross-OS swap, $/backslash safe)', () => {
  const src = 'open /Users/alice/app then /Users/alice/app again';
  const tokenized = tokenizeHome(src, '/Users/alice');
  // Windows home with a backslash; detokenize uses split/join so the replacement is
  // literal (a '$' or '\\' in the new home is NOT treated as a regex replacement
  // token). NOTE: only the home PREFIX is swapped - the trailing '/app' separator is
  // left untouched (the remap is "clean the obvious prefix", not a path rewrite).
  const landed = detokenizeHome(tokenized, 'C:\\Users\\bob');
  assert.equal(landed, 'open C:\\Users\\bob/app then C:\\Users\\bob/app again');
});

test('detokenizeHome treats $ in the replacement home as a literal (no regex magic)', () => {
  // A pathological home containing '$&' must not trigger regex replacement semantics.
  const tokenized = tokenizeHome('home=/h/x and /h/y', '/h');
  const landed = detokenizeHome(tokenized, '/weird$&home');
  assert.equal(landed, 'home=/weird$&home/x and /weird$&home/y');
});

test('tokenizeHome is case-insensitive and matches the forward-slash variant of a Windows home', () => {
  // A Windows backslash home also appears slash-flipped inside JSON; both forms,
  // and a case-different drive letter, are caught.
  const text = 'a=C:\\Users\\Alice\\app b=c:/users/alice/app';
  const out = tokenizeHome(text, 'C:\\Users\\alice');
  assert.equal(out, `a=${HOME_TOKEN}\\app b=${HOME_TOKEN}/app`);
});

test('round-trip on the home-path fixture: token then detokenize swaps the POSIX home everywhere', () => {
  const text = fixture('home-path-session.jsonl');
  // The fixture mentions /Users/alice three times (cwd + two prose refs).
  assert.ok((text.match(/\/Users\/alice/g) || []).length >= 3);
  const tokenized = tokenizeHome(text, '/Users/alice');
  assert.ok(!tokenized.includes('/Users/alice'));
  assert.ok(tokenized.includes(HOME_TOKEN));
  const landed = detokenizeHome(tokenized, '/home/bob');
  assert.ok(!landed.includes('/Users/alice'));
  assert.ok(!landed.includes(HOME_TOKEN));
  assert.ok(landed.includes('/home/bob/app'));
});

test('detokenizeHome with no token present is a no-op', () => {
  const text = 'nothing to swap here';
  assert.equal(detokenizeHome(text, '/home/bob'), text);
});
