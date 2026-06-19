# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- macOS/Linux support via a bundled Node CLI (`scripts/cli.mjs`).
- Cross-platform archiving (`tar -czf`) and cross-platform trash.
- Path remapping on import (rewrite source `${HOME}`/cwd tokens to the destination).

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

[Unreleased]: https://github.com/TomSOhm/claude-session-port/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/TomSOhm/claude-session-port/releases/tag/v0.1.0
