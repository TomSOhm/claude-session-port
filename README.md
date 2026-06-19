# claude-session-port

**Portable single-session export for Claude Code - no cloud, no account, just a zip.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Platform: Windows](https://img.shields.io/badge/platform-Windows-blue)
![Status: v0.1.0](https://img.shields.io/badge/status-v0.1.0-orange)
![Cross-OS: roadmap](https://img.shields.io/badge/macOS%2FLinux-roadmap-lightgrey)

Four native Claude Code slash-commands to **list, export, import, and delete** a single
Claude Code session by its UUID - so you can carry one conversation from one machine to
another, resume it, and keep your local session folder tidy. It moves *one session as a
plain zip file*; you move that zip however you like (USB, shared drive, chat). Nothing is
uploaded anywhere.

```text
/resume_title_uuid              # which session is which? (maps a /resume row → UUID)
/export_uuid <uuid> <folder>    # zip one session for transport
/import_uuid <zip>              # land it on the other machine so /resume finds it
/delete_uuid <uuid> [--hard]    # prune a local session (Recycle Bin or permanent)
```

---

## Why this exists

Claude Code has **no built-in command to export/import a session between machines**
(open feature request: [anthropics/claude-code#18645](https://github.com/anthropics/claude-code/issues/18645)).
Sessions live on local disk as append-only JSONL transcripts:

```
~/.claude/projects/<encoded-cwd>/<uuid>.jsonl
```

…where `<encoded-cwd>` is your project's absolute path with every non-alphanumeric
character replaced by `-`. Because sessions are **indexed by absolute path**, you can't
just copy the file and have `/resume` find it - the destination has to resolve to the same
encoded folder, and you need the right UUID. This tool automates that copy + the UUID
bookkeeping for a single session.

The official [`--teleport`](https://code.claude.com/docs/en/sessions) flow only pulls a
**web** session down to the terminal (one-way), and the built-in `/export session.md`
produces a read-only transcript you **cannot resume**. Neither moves a *local, resumable*
session between two terminals.

## How it's different

Most community tools in this space continuously **sync your entire `.claude` directory**
to a cloud bucket or git remote. That's a different job. `claude-session-port` is
deliberately small:

- **Single-session granularity** - move exactly one conversation, not everything.
- **Zero infrastructure** - no account, no cloud bucket, no git remote, no keys. The
  artifact is one `.zip`; you choose the transport.
- **Native slash-commands** - runs inside Claude Code, installs as a plugin.
- **The SIZE → picker bridge** - `/resume_title_uuid` maps each `/resume` picker row to its
  UUID using file **size** (the picker shows size but not the UUID), which is otherwise
  hard to determine.

### Comparison

| Tool | Scope | Infra needed | Encryption | Cross-OS | Granularity | Resumable |
|---|---|---|---|---|---|---|
| **claude-session-port** | move 1 session | **none** (a zip) | your transport | Windows (roadmap: all) | single session | ✅ |
| [claude-sync](https://github.com/tawanorg/claude-sync) | sync everything | Cloudflare R2 | E2E | ✅ (HOME remap) | whole `.claude` | ✅ |
| [claude-code-sync](https://github.com/porkchop/claude-code-sync) | sync everything | git remote | optional | ✅ | projects + history | ✅ |
| [hex/claude-sessions](https://github.com/hex/claude-sessions) | session manager | git | age (secrets) | ✅ | per session | ✅ |
| `--teleport` (official) | web → local | Anthropic web | - | n/a | one session | ✅ (one-way) |
| `/export session.md` (built-in) | share transcript | none | - | ✅ | one session | ❌ |

If you want continuous, encrypted, whole-environment sync, use claude-sync. If you just
want to hand one conversation to your other laptop, use this.

---

## Install

> **Platform:** Windows (PowerShell) for v0.1.0. macOS/Linux is on the [roadmap](#roadmap).

### Option A - as a Claude Code plugin (recommended)

Inside Claude Code:

```text
/plugin marketplace add TomSOhm/claude-session-port
/plugin install claude-session-port@claude-session-port
```

The four commands then appear under `/`.

### Option B - manual (no plugin system)

Copy the command files into your commands folder:

- **User-level** (all projects): `~/.claude/commands/`
- **Project-level** (one repo): `<repo>/.claude/commands/`

```bash
# from a clone of this repo
cp commands/*.md ~/.claude/commands/
```

They're available immediately via `/` autocomplete.

---

## Usage

All commands operate on the **current project folder** - run them from the repo directory
whose sessions you want to manage. A "UUID" can be the full id or a prefix of ≥ 8
characters.

### `/resume_title_uuid` - find which session is which

- **Args:** none
- **What it does:** lists every saved session for the current project - `UUID · size · age
  · git-branch · title` - newest first, and flags `AGENT` (subagent) rows that `/resume`
  hides.
- **Why:** the `/resume` picker shows **size** but not the **UUID**. This command is the
  bridge: match the picker row's size here to read off its UUID, then feed that UUID to
  `/export_uuid` or `/delete_uuid`.

```text
/resume_title_uuid
```
```
87ed171d-1d50-4818-9888-d996cf52cfad   1.9MB   2h ago   main          add learn history modal
b3c90a2f-...                            420KB   1d ago   feat/login    AGENT  (subagent)
match key = SIZE (== /resume). AGENT rows + the current session are hidden from /resume.
```

### `/export_uuid <uuid|prefix> <dst-folder>` - package a session

- **Args:** `<uuid|prefix>` then the destination `<dst-folder>` (may contain spaces).
- **What it does:** zips the session's `<uuid>.jsonl`, its `<uuid>/` sidecar dir (subagent
  transcripts, if any), and a `manifest.json` into `<dst-folder>/<uuid>.zip`.
- **Why:** produces one portable file you can move to another machine by any means.
- **Note:** this exports the *conversation*, not your repo code - sync the code separately
  with git.

```text
/export_uuid 87ed171d C:\Users\you\Dropbox\cc-sessions
```

### `/import_uuid <path-to-uuid.zip>` - land a session here

- **Args:** one path to a `.zip` produced by `/export_uuid`.
- **What it does:** unpacks the session into
  `~/.claude/projects/<encoded-current-dir>/` so `/resume` can find it. Refuses to
  overwrite an existing session of the same UUID.
- **Why:** makes an exported conversation resumable on this machine.
- **Important:** run it **from the repo directory you want to resume in** - the target
  folder is derived from the current working directory.

```text
/import_uuid C:\Users\you\Dropbox\cc-sessions\87ed171d-....zip
# then:
/resume      # pick the row by its size
```

### `/delete_uuid <uuid|prefix> [--hard]` - prune a local session

- **Args:** `<uuid|prefix>`, optional `--hard`.
- **What it does:** default sends the session (and its sidecar dir) to the **Recycle Bin**
  (recoverable). `--hard` deletes permanently - but only after you type `yes` to confirm.
- **Why:** keep the local session list clean after exporting, or remove dead sessions.
- **Safety:** never touches your `memory\` folder; aborts on an ambiguous prefix.

```text
/delete_uuid 87ed171d            # → Recycle Bin
/delete_uuid 87ed171d --hard     # → permanent (asks to confirm first)
```

---

## How it works

- **Session location:** `~/.claude/projects/<encoded-cwd>/<uuid>.jsonl`, where
  `<encoded-cwd>` is the absolute project path with every non-alphanumeric character
  replaced by `-` (e.g. `C:\Users\you\my-app` → `C--Users-you-my-app`).
- **The zip contains:** `<uuid>.jsonl` (the transcript = the context), the optional
  `<uuid>/` sidecar directory (subagent transcripts), and `manifest.json`:

  ```json
  {
    "uuid": "<uuid>",
    "sourceProjectPath": "C:\\Users\\you\\my-app",
    "encodedSource": "C--Users-you-my-app",
    "jsonlBytes": 2012664,
    "hasSidecar": true
  }
  ```
- **The SIZE bridge:** the `/resume` picker displays a session's file size but not its
  UUID; `/resume_title_uuid` lists both, so size is the reliable key to match a picker row
  to its UUID.

See [docs/session-format.md](docs/session-format.md) for the full layout and caveats.

## Limitations & known issues

- **Windows-first.** v0.1.0 is PowerShell. macOS/Linux is on the [roadmap](#roadmap).
- **No path remapping yet.** The transcript carries the *source* machine's absolute paths.
  Resume works, but old paths appear in history, and new work uses the destination
  machine's paths. This is fine within Windows/same-user; cross-OS remapping is planned.
- **Exit Claude Code before exporting.** Claude Code flushes the transcript to disk on
  exit - export the session from a *different* session (or after exiting the one you want).
- **Format fragility.** This relies on Claude Code's on-disk session format, which
  Anthropic can change between releases. Manual session copying has reportedly broken across
  CLI versions before. See [Compatibility](#compatibility) and please open an issue if a CC
  update breaks it.
- **Single session only.** This is not whole-`.claude` sync - by design.

## Compatibility

| Claude Code version | Status |
|---|---|
| _fill in the version you tested_ | ✅ working |

The session-storage layout is undocumented and may change. If a Claude Code update breaks a
command, please [open an issue](https://github.com/TomSOhm/claude-session-port/issues) with
your CC version.

## Roadmap

- **Cross-OS support (macOS/Linux).** Replace the embedded PowerShell with a single bundled
  **Node** script (`scripts/cli.mjs`, invoked via `node ${CLAUDE_PLUGIN_ROOT}/...`) - Node
  is guaranteed present since Claude Code itself runs on it. Commands become thin,
  OS-agnostic wrappers.
- **Portable archiving.** Use `tar -czf` (bsdtar ships on Windows 10+, macOS, and Linux)
  for a zero-dependency container across platforms.
- **Cross-OS trash.** Recycle Bin on Windows, `trash`/AppleScript on macOS,
  `gio trash`/`trash-cli` on Linux, with a confirmed hard-delete fallback.
- **Path remapping on import.** Rewrite the source machine's `${HOME}`/cwd tokens to the
  destination's, so a session moves cleanly between different usernames and OSes (Windows ↔
  macOS ↔ Linux) - not just same-OS.

Contributions toward any of these are very welcome - see below.

## Contributing

Issues and PRs welcome. Good first contributions: porting a command to a macOS/Linux
backend, the Node rewrite, or path-remapping on import. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the round-trip test and conventions.

## License

[MIT](LICENSE)

## Related projects & acknowledgements

- [anthropics/claude-code#18645](https://github.com/anthropics/claude-code/issues/18645) - the open export/import feature request
- [claude-sync](https://github.com/tawanorg/claude-sync) - full `.claude` sync via Cloudflare R2, E2E encrypted (the `${HOME}`-token path-remap idea is theirs)
- [claude-code-sync](https://github.com/porkchop/claude-code-sync) - git-based whole-environment sync
- [hex/claude-sessions](https://github.com/hex/claude-sessions) - session manager with deterministic UUID resume
- [Claude Code - Manage sessions](https://code.claude.com/docs/en/sessions) - official session docs
