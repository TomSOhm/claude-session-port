# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Deeper path remapping beyond the home prefix.
- Maintainer-confirmed live `/resume` pickup on macOS and Linux (currently
  community-confirmed; CI file-verifies the mechanics).

## [0.2.0] - 2026-06-20

### Changed
- Ported all four commands (`/resume_title_uuid`, `/export_uuid`, `/import_uuid`,
  `/delete_uuid`) from embedded Windows-only PowerShell to a single bundled, zero-dependency
  cross-OS Node CLI (`scripts/cli.mjs`). The `commands/*.md` files are now thin wrappers that
  parse `$ARGUMENTS` and call the CLI via `node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs"`.

### Added
- macOS and Linux support: all four commands run on Windows, macOS, and Linux, with
  any-direction session transfer.
- `${CSP_HOME}` home-prefix path remapping: the source machine's home is tokenized on export
  and detokenized to the destination machine's home on import.
- `.tar.gz` export archive via the system `tar` (replacing the v0.1.0 `.zip`); import still
  accepts a legacy v0.1.0 `.zip`.
- v2 export manifest (`schemaVersion`, `sourceOS`, `sourceHome`, `homeTokenized`); a legacy
  v0.1.0 manifest is read as not-tokenized and landed as-is.
- Cross-OS native trash for `/delete_uuid` (Recycle Bin / Finder Trash / `gio trash` /
  `trash-cli`) with a quarantine-folder fallback where no native trash exists.
- GitHub Actions CI matrix (`windows-latest`, `macos-latest`, `ubuntu-latest`) running
  `node --check` and `node --test` on every push and pull request.

## [0.1.0] - 2026-06-19

### Added
- `/resume_title_uuid` - list a project's sessions (UUID, size, age, branch, title) and map
  a `/resume` picker row to its UUID via file size.
- `/export_uuid` - export one session (`.jsonl` + sidecar dir + `manifest.json`) as a zip.
- `/import_uuid` - import an exported session zip into the current project so `/resume`
  finds it.
- `/delete_uuid` - delete a session to the Recycle Bin (default) or permanently (`--hard`,
  with confirmation).
- Packaged as a Claude Code plugin (`.claude-plugin/plugin.json`) and self-hosted
  marketplace (`.claude-plugin/marketplace.json`).

[Unreleased]: https://github.com/TomSOhm/claude-session-port/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/TomSOhm/claude-session-port/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/TomSOhm/claude-session-port/releases/tag/v0.1.0
