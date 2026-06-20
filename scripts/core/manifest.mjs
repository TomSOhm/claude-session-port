// core/manifest.mjs
//
// What: Build and parse the export bundle's manifest.json (schema v2).
// How:  Pure functions. buildManifest takes everything as params (no env reads);
//       parseManifest tolerates v0.1.0 manifests (no schemaVersion / homeTokenized)
//       by defaulting homeTokenized=false so legacy bundles import unremapped.
// Deps: none (pure).
//
// v2 shape:
// {
//   "schemaVersion": 2,
//   "uuid": "<uuid>",
//   "sourceProjectPath": "/Users/you/my-app",
//   "encodedSource": "-Users-you-my-app",
//   "sourceOS": "darwin",
//   "sourceHome": "/Users/you",
//   "homeTokenized": true,
//   "jsonlBytes": 2012664,
//   "hasSidecar": true
// }

export const SCHEMA_VERSION = 2;

/**
 * buildManifest({ uuid, sourceProjectPath, encodedSource, sourceOS, sourceHome,
 *                 homeTokenized, jsonlBytes, hasSidecar }) -> object
 * Returns a plain object with a stable key order, ready to JSON.stringify.
 */
export function buildManifest({
  uuid,
  sourceProjectPath,
  encodedSource,
  sourceOS,
  sourceHome,
  homeTokenized,
  jsonlBytes,
  hasSidecar,
}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    uuid,
    sourceProjectPath,
    encodedSource,
    sourceOS,
    sourceHome,
    homeTokenized: Boolean(homeTokenized),
    jsonlBytes,
    hasSidecar: Boolean(hasSidecar),
  };
}

/** Serialize a manifest object to pretty JSON (2-space indent), matching tooling. */
export function stringifyManifest(manifest) {
  return JSON.stringify(manifest, null, 2);
}

/**
 * parseManifest(json) -> normalized manifest object
 * Accepts a JSON string or an already-parsed object. Throws on invalid JSON or a
 * manifest with no `uuid`. Back-compat: a v0.1.0 manifest (no schemaVersion) is
 * normalized to schemaVersion:1, homeTokenized:false.
 */
export function parseManifest(json) {
  const raw = typeof json === 'string' ? JSON.parse(json) : json;
  if (!raw || typeof raw !== 'object') {
    throw new Error('manifest is not an object');
  }
  if (!raw.uuid || typeof raw.uuid !== 'string') {
    throw new Error('manifest is missing "uuid"');
  }
  const schemaVersion =
    typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1;
  return {
    schemaVersion,
    uuid: raw.uuid,
    sourceProjectPath: raw.sourceProjectPath ?? null,
    encodedSource: raw.encodedSource ?? null,
    sourceOS: raw.sourceOS ?? null,
    sourceHome: raw.sourceHome ?? null,
    // Legacy bundles predate tokenization, so treat them as not tokenized.
    homeTokenized: schemaVersion >= 2 ? Boolean(raw.homeTokenized) : false,
    jsonlBytes: typeof raw.jsonlBytes === 'number' ? raw.jsonlBytes : null,
    hasSidecar: Boolean(raw.hasSidecar),
  };
}
