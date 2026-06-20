// tests/sessions.test.mjs
//
// resolveOne / listSessions are pure over an injected { fs, pathlib }. We feed REAL
// temp files (node:fs) under os.tmpdir() and the native path flavour, covering the
// none / one / many cases for a full uuid and a >=8-char prefix, plus the `memory`
// guard and the sidecar-detection flag.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveOne, listSessions } from '../scripts/core/sessions.mjs';

const pathlib = path; // native flavour is fine - these are real files on this runner.

function mkBase(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-sessions-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function touch(base, name, contents = '{}\n') {
  fs.writeFileSync(path.join(base, name), contents);
}

const U1 = 'aaaaaaaa-1111-2222-3333-444444444444';
const U2 = 'aaaaaaaa-9999-8888-7777-666666666666';
const U3 = 'bbbbbbbb-0000-0000-0000-000000000000';

test('listSessions returns [] for a missing base dir', () => {
  const missing = path.join(os.tmpdir(), 'csp-does-not-exist-zzzz');
  assert.deepEqual(listSessions(missing, { fs, pathlib }), []);
});

test('listSessions ignores non-.jsonl entries and the `memory` pseudo-session', (t) => {
  const base = mkBase(t);
  touch(base, `${U1}.jsonl`);
  touch(base, 'memory.jsonl'); // must never be treated as a session
  touch(base, 'README.txt'); // not a .jsonl
  const all = listSessions(base, { fs, pathlib });
  const uuids = all.map((s) => s.uuid);
  assert.deepEqual(uuids, [U1]);
});

test('resolveOne: none when nothing matches the prefix', (t) => {
  const base = mkBase(t);
  touch(base, `${U1}.jsonl`);
  const r = resolveOne(base, 'ffffffff', { fs, pathlib });
  assert.equal(r.status, 'none');
});

test('resolveOne: one for a full uuid', (t) => {
  const base = mkBase(t);
  touch(base, `${U1}.jsonl`);
  touch(base, `${U3}.jsonl`);
  const r = resolveOne(base, U1, { fs, pathlib });
  assert.equal(r.status, 'one');
  assert.equal(r.session.uuid, U1);
  assert.equal(r.session.file, path.join(base, `${U1}.jsonl`));
});

test('resolveOne: one for a >=8-char prefix that is unique', (t) => {
  const base = mkBase(t);
  touch(base, `${U1}.jsonl`); // aaaaaaaa-1111...
  touch(base, `${U3}.jsonl`); // bbbbbbbb-0000...
  // 'aaaaaaaa-1' uniquely picks U1 (U3 starts with bbbbbbbb).
  const r = resolveOne(base, 'aaaaaaaa-1', { fs, pathlib });
  assert.equal(r.status, 'one');
  assert.equal(r.session.uuid, U1);
});

test('resolveOne: many when an 8-char prefix matches two uuids', (t) => {
  const base = mkBase(t);
  touch(base, `${U1}.jsonl`); // aaaaaaaa-1111...
  touch(base, `${U2}.jsonl`); // aaaaaaaa-9999...
  const r = resolveOne(base, 'aaaaaaaa', { fs, pathlib });
  assert.equal(r.status, 'many');
  assert.equal(r.matches.length, 2);
  assert.deepEqual([...r.matches].sort(), [U1, U2].sort());
});

test('resolveOne: empty/blank/undefined prefix returns none (must NOT match everything)', (t) => {
  const base = mkBase(t);
  touch(base, `${U1}.jsonl`);
  touch(base, `${U3}.jsonl`);
  // A dropped or empty argument must never silently select sessions (startsWith('')
  // would otherwise match all) - resolveOne treats it as no match.
  assert.equal(resolveOne(base, '', { fs, pathlib }).status, 'none');
  assert.equal(resolveOne(base, '   ', { fs, pathlib }).status, 'none');
  assert.equal(resolveOne(base, undefined, { fs, pathlib }).status, 'none');
});

test('listSessions detects a sidecar directory named exactly <uuid>', (t) => {
  const base = mkBase(t);
  touch(base, `${U1}.jsonl`);
  fs.mkdirSync(path.join(base, U1)); // sidecar dir (no extension)
  touch(base, `${U3}.jsonl`); // no sidecar
  const all = listSessions(base, { fs, pathlib });
  const byId = Object.fromEntries(all.map((s) => [s.uuid, s]));
  assert.equal(byId[U1].hasSidecar, true);
  assert.equal(byId[U1].sidecarDir, path.join(base, U1));
  assert.equal(byId[U3].hasSidecar, false);
});
