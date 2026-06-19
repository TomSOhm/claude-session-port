// tests/archive.test.mjs
//
// Integration test against the REAL system `tar` (bsdtar on Win10+/macOS, GNU tar on
// Linux). We stage a temp tree (incl. a nested subdir and a filename with a space),
// createTarGz it, extract into a second temp dir, and assert the extracted bytes match
// the originals byte-for-byte. Everything lives under os.tmpdir() and is cleaned up.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createTarGz, extract, sniffFormat } from '../scripts/core/archive.mjs';

// The archive module's injected deps, wired to the real platform (node:path native).
const deps = { spawn: spawnSync, fs };

// Make a fresh, unique temp dir and register cleanup.
function mkTmp(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Recursively list relative file paths (POSIX-joined keys) -> Buffer of bytes.
function readTree(root) {
  const map = new Map();
  const walk = (dir, rel) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      const key = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walk(abs, key);
      else map.set(key, fs.readFileSync(abs));
    }
  };
  walk(root, '');
  return map;
}

test('createTarGz then extract reproduces a nested tree byte-for-byte (incl. a space in a name)', (t) => {
  const stage = mkTmp(t, 'csp-arch-stage-');
  const outDir = mkTmp(t, 'csp-arch-out-');
  const dest = mkTmp(t, 'csp-arch-dest-');

  // Stage: a top file, a file whose NAME has a space, and a nested subdir file.
  fs.writeFileSync(path.join(stage, 'manifest.json'), '{"uuid":"abc"}\n');
  fs.writeFileSync(
    path.join(stage, 'has space.jsonl'),
    'line one\nline two with /Users/alice\n',
  );
  fs.mkdirSync(path.join(stage, 'sidecar', 'nested'), { recursive: true });
  // Binary-ish content to make the byte-for-byte check meaningful.
  fs.writeFileSync(
    path.join(stage, 'sidecar', 'nested', 'blob.bin'),
    Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x0a, 0x0d]),
  );

  const before = readTree(stage);

  const archivePath = path.join(outDir, 'bundle.tar.gz');
  const returned = createTarGz(stage, archivePath, deps);
  assert.equal(returned, archivePath);
  assert.ok(fs.existsSync(archivePath), 'archive was written');
  assert.equal(sniffFormat(archivePath, { fs }), 'gzip');

  const res = extract(archivePath, dest, deps);
  assert.equal(res.format, 'gzip');

  const after = readTree(dest);

  // Same set of files (createTarGz archives the CONTENTS of stage via `-C stage .`).
  assert.deepEqual(
    [...after.keys()].sort(),
    [...before.keys()].sort(),
    'extracted file set matches the staged set',
  );
  // Same bytes for each file.
  for (const [key, buf] of before) {
    assert.ok(after.has(key), `missing extracted file: ${key}`);
    assert.deepEqual(after.get(key), buf, `bytes differ for ${key}`);
  }
});

test('extract throws an actionable error on an unrecognized archive format', (t) => {
  const dir = mkTmp(t, 'csp-arch-bad-');
  const dest = mkTmp(t, 'csp-arch-bad-dest-');
  const bogus = path.join(dir, 'mystery.dat');
  // No known extension and no gzip/zip magic bytes -> 'unknown'.
  fs.writeFileSync(bogus, 'not an archive at all');
  assert.equal(sniffFormat(bogus, { fs }), 'unknown');
  assert.throws(() => extract(bogus, dest, deps), /unrecognized archive format/);
});

test('sniffFormat detects gzip and zip by magic bytes when the extension is ambiguous', (t) => {
  const dir = mkTmp(t, 'csp-arch-sniff-');
  const gz = path.join(dir, 'ambiguous.dat');
  const zip = path.join(dir, 'ambiguous2.dat');
  fs.writeFileSync(gz, Buffer.from([0x1f, 0x8b, 0x08, 0x00]));
  fs.writeFileSync(zip, Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  assert.equal(sniffFormat(gz, { fs }), 'gzip');
  assert.equal(sniffFormat(zip, { fs }), 'zip');
});
