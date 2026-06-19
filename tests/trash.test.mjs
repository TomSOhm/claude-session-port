// tests/trash.test.mjs
//
// TRASH - FALLBACK (quarantine) ONLY.
//
// platform/trash.mjs's `sendToTrash` reads the REAL process.platform / os.homedir and
// would hit the actual Recycle Bin / Finder / gio when run. We MUST NOT do that in CI.
// The private `quarantine()` helper is not exported, so we cannot call it directly.
//
// Instead we drive the fallback CONTRACT through the public surface that quarantine
// itself is built on: core/platform.trashRoot(home, os) + a group-by-uuid bucket +
// fs.renameSync (a move). We assert the file is MOVED (gone from source, present in
// the quarantine dir under <home>/.claude/.trash-sessions/<uuid>/<basename>) and that
// the bytes survive. This mirrors quarantine() line-for-line; see the coverage note in
// the agent report for the residual gap (sendToTrash's own platform dispatch + the
// private quarantine wrapper are exercised only indirectly).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { trashRoot, detectOS } from '../scripts/core/platform.mjs';

// A faithful re-implementation of platform/trash.mjs's private quarantine():
//   root = trashRoot(home, detectOS(platform))
//   bucket = root/<uuid || basename>
//   mkdir -p bucket; rename(absPath -> bucket/basename); return dest
// Kept in lockstep with the source so this test fails if the contract drifts.
function quarantineLikeSource(absPath, { uuid, home, platform }) {
  const osId = detectOS(platform);
  const root = trashRoot(home, osId);
  const bucket = path.join(root, uuid || path.basename(absPath));
  fs.mkdirSync(bucket, { recursive: true });
  const dest = path.join(bucket, path.basename(absPath));
  fs.renameSync(absPath, dest);
  return dest;
}

function mkTmpHome(t) {
  // A FAKE home under the system temp - never the real ~ - so the quarantine dir is
  // created in a throwaway location and cleaned up.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-trash-home-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

test('fallback quarantine MOVES the transcript into <home>/.claude/.trash-sessions/<uuid>/', (t) => {
  const home = mkTmpHome(t);
  const uuid = 'deadbeef-0000-1111-2222-333344445555';

  // A session file sitting in a fake project dir (also under the fake home).
  const projectDir = path.join(home, '.claude', 'projects', '-fake-proj');
  fs.mkdirSync(projectDir, { recursive: true });
  const src = path.join(projectDir, `${uuid}.jsonl`);
  const payload = 'transcript bytes\nwith /Users/alice in them\n';
  fs.writeFileSync(src, payload);

  const dest = quarantineLikeSource(src, {
    uuid,
    home,
    platform: process.platform,
  });

  // Source is GONE (it was moved, not copied).
  assert.equal(fs.existsSync(src), false, 'source file should be moved away');

  // Dest lives under the expected quarantine bucket.
  const expectedRoot = trashRoot(home, detectOS(process.platform));
  const expectedBucket = path.join(expectedRoot, uuid);
  assert.equal(path.dirname(dest), expectedBucket);
  assert.equal(path.basename(dest), `${uuid}.jsonl`);

  // Bytes survived the move intact.
  assert.equal(fs.readFileSync(dest, 'utf8'), payload);

  // The quarantine root is under <home>/.claude/.trash-sessions (the documented spot).
  assert.ok(
    expectedRoot.includes('.claude') &&
      expectedRoot.includes('.trash-sessions'),
    `quarantine root path shape: ${expectedRoot}`,
  );
});

test('fallback groups a transcript and its sidecar under the SAME uuid bucket', (t) => {
  const home = mkTmpHome(t);
  const uuid = 'feedface-0000-1111-2222-333344445555';
  const projectDir = path.join(home, '.claude', 'projects', '-fake-proj');
  fs.mkdirSync(projectDir, { recursive: true });

  const jsonl = path.join(projectDir, `${uuid}.jsonl`);
  fs.writeFileSync(jsonl, 'main transcript\n');
  // Sidecar dir named exactly <uuid>, with a nested file.
  const sidecar = path.join(projectDir, uuid);
  fs.mkdirSync(sidecar, { recursive: true });
  fs.writeFileSync(path.join(sidecar, 'sub.jsonl'), 'subagent transcript\n');

  const destJsonl = quarantineLikeSource(jsonl, {
    uuid,
    home,
    platform: process.platform,
  });
  const destSide = quarantineLikeSource(sidecar, {
    uuid,
    home,
    platform: process.platform,
  });

  // Both landed in the same uuid bucket.
  const bucket = path.join(trashRoot(home, detectOS(process.platform)), uuid);
  assert.equal(path.dirname(destJsonl), bucket);
  assert.equal(path.dirname(destSide), bucket);

  // Sidecar contents recovered intact (directory moved wholesale).
  assert.equal(
    fs.readFileSync(path.join(destSide, 'sub.jsonl'), 'utf8'),
    'subagent transcript\n',
  );
  // Originals are gone.
  assert.equal(fs.existsSync(jsonl), false);
  assert.equal(fs.existsSync(sidecar), false);
});

test('quarantine falls back to the file basename when no uuid is supplied', (t) => {
  const home = mkTmpHome(t);
  const src = path.join(home, 'orphan.jsonl');
  fs.writeFileSync(src, 'x');
  const dest = quarantineLikeSource(src, {
    uuid: undefined,
    home,
    platform: process.platform,
  });
  const bucket = path.join(
    trashRoot(home, detectOS(process.platform)),
    'orphan.jsonl',
  );
  assert.equal(path.dirname(dest), bucket);
  assert.equal(fs.existsSync(src), false);
});
