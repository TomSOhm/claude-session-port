// tests/manifest.test.mjs
//
// buildManifest / stringifyManifest / parseManifest are pure. We assert the
// build->stringify->parse round-trip, legacy back-compat (no schemaVersion), and the
// two throw cases (bad JSON, missing uuid).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildManifest,
  stringifyManifest,
  parseManifest,
  SCHEMA_VERSION,
} from '../scripts/core/manifest.mjs';

const sample = {
  uuid: '11111111-2222-3333-4444-555555555555',
  sourceProjectPath: '/Users/alice/app',
  encodedSource: '-Users-alice-app',
  sourceOS: 'darwin',
  sourceHome: '/Users/alice',
  homeTokenized: true,
  jsonlBytes: 2012664,
  hasSidecar: true,
};

test('buildManifest stamps the current schema version and coerces booleans', () => {
  const m = buildManifest({ ...sample, homeTokenized: 1, hasSidecar: 0 });
  assert.equal(m.schemaVersion, SCHEMA_VERSION);
  assert.equal(m.homeTokenized, true); // Boolean(1)
  assert.equal(m.hasSidecar, false); // Boolean(0)
  assert.equal(m.uuid, sample.uuid);
});

test('build -> stringify -> parse round-trips every field', () => {
  const built = buildManifest(sample);
  const json = stringifyManifest(built);
  // stringify is pretty (2-space) JSON.
  assert.ok(json.includes('\n  "uuid"'));
  const parsed = parseManifest(json);
  assert.equal(parsed.schemaVersion, SCHEMA_VERSION);
  assert.equal(parsed.uuid, sample.uuid);
  assert.equal(parsed.sourceProjectPath, sample.sourceProjectPath);
  assert.equal(parsed.encodedSource, sample.encodedSource);
  assert.equal(parsed.sourceOS, sample.sourceOS);
  assert.equal(parsed.sourceHome, sample.sourceHome);
  assert.equal(parsed.homeTokenized, true);
  assert.equal(parsed.jsonlBytes, sample.jsonlBytes);
  assert.equal(parsed.hasSidecar, true);
});

test('parseManifest accepts an already-parsed object (not only a string)', () => {
  const built = buildManifest(sample);
  const parsed = parseManifest(built);
  assert.equal(parsed.uuid, sample.uuid);
  assert.equal(parsed.homeTokenized, true);
});

test('legacy manifest with no schemaVersion parses as schemaVersion:1, homeTokenized:false', () => {
  // A v0.1.0 bundle: just a uuid, no schemaVersion, no homeTokenized.
  const legacy = JSON.stringify({
    uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    sourceProjectPath: '/old/path',
  });
  const parsed = parseManifest(legacy);
  assert.equal(parsed.schemaVersion, 1);
  // Even if a stray homeTokenized:true sneaks into a legacy object, v<2 forces false.
  assert.equal(parsed.homeTokenized, false);
  assert.equal(parsed.sourceProjectPath, '/old/path');
  // Missing optional fields normalize to null / false.
  assert.equal(parsed.encodedSource, null);
  assert.equal(parsed.jsonlBytes, null);
  assert.equal(parsed.hasSidecar, false);
});

test('legacy manifest ignores a stray homeTokenized flag (forced false below v2)', () => {
  const legacy = JSON.stringify({ uuid: 'u', homeTokenized: true });
  assert.equal(parseManifest(legacy).homeTokenized, false);
});

test('parseManifest throws on invalid JSON', () => {
  assert.throws(() => parseManifest('{ not json'), /./);
});

test('parseManifest throws when uuid is missing', () => {
  assert.throws(
    () => parseManifest(JSON.stringify({ schemaVersion: 2 })),
    /missing "uuid"/,
  );
});

test('parseManifest throws when the input is not an object', () => {
  assert.throws(() => parseManifest('null'), /not an object/);
});
