# Design: cross-OS Node CLI for claude-session-port

## Context

v0.1.0 ships 4 Claude Code slash-commands as Windows-only PowerShell. This design ports them
to a single dependency-free Node CLI so all four work on Windows, macOS, and Linux, with
any-direction session transfer. The slash-command `.md` files become thin wrappers that call
the bundled CLI; the logic lives in one place and is tested on three OSes via GitHub Actions.

## Decisions (from brainstorm, locked)

- **Full parity:** all 4 commands on Win/mac/Linux + any-direction transfer.
- **Vehicle:** single **zero-dependency Node CLI** (Approach A). Node is guaranteed present
  (Claude Code runs on it). No npm dependencies. Tests use the built-in `node:test` runner.
- **Path remap:** "clean the obvious paths" — tokenize the **home-directory prefix** to a
  `${CSP_HOME}` token on export, detokenize to the target home on import. No deep rewrite.
- **Delete:** **native trash per OS** (Recycle Bin / Finder Trash / `gio trash` or
  `trash-cli`), with a **quarantine-folder fallback** (`~/.claude/.trash-sessions/`) where no
  native trash exists (e.g. headless Linux).
- **Archive:** `.tar.gz` via the system `tar` (bsdtar ships on Win10+/mac/Linux). Import also
  accepts legacy `.zip` (from v0.1.0 exports).
- **Testing:** CI matrix `[windows-latest, macos-latest, ubuntu-latest]`. CI proves the file
  mechanics on real OSes; live `/resume` pickup is confirmed on Windows by the maintainer and
  documented as community-confirmed on mac/Linux.
- **Node baseline:** Node ≥ 18 (for `node:test`); dev machine is Node 25.

## Architecture

```
scripts/
  cli.mjs                 # entry: dispatch on argv[2] -> command module; print result; set exit code
  core/                   # PURE logic — platform passed in as args, no global OS reads
    platform.mjs          #   detectOS(), homeDir(), projectsBase(home) -> ~/.claude/projects
    encode.mjs            #   encodeCwd(absPath) -> non-alphanumerics replaced by '-'
    sessions.mjs          #   listSessions(baseDir), resolveOne(baseDir, uuidOrPrefix) (0/1/many)
    remap.mjs             #   tokenizeHome(text, home), detokenizeHome(text, home)
    manifest.mjs          #   buildManifest(...), parseManifest(json)
    archive.mjs           #   createTarGz(stageDir, outFile), extract(archive, destDir), sniffFormat(path)
    titles.mjs            #   firstUserTitle(jsonl), gitBranch(jsonl), isAgent(jsonl)  (port of list logic)
  commands/               # thin orchestration over core (impure: touch fs, spawn tar/trash)
    list.mjs export.mjs import.mjs delete.mjs
  platform/
    trash.mjs             # sendToTrash(absPath) -> native per OS, else quarantine fallback
package.json              # name, type:module optional, scripts.test = "node --test", engines.node >=18, NO deps
```

Rule: `core/` functions are **pure and platform-injected** (take `home`/`os` as parameters,
never read `process.platform`/`os.homedir()` themselves) so tests can simulate any OS on any
runner. Only `platform/trash.mjs` and the `commands/` glue do real I/O.

## CLI interface contract

Invoked from the command wrappers as:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" <command> [args...]`
The CLI uses `process.cwd()` (the directory Claude Code runs the command from) to derive the
project folder — same as the PowerShell `(Get-Location).Path` behavior.

| Command | Args | Behavior | Exit |
|---|---|---|---|
| `list` | none | Print one row per session for the current project: `UUID  SIZE  AGE  BRANCH  [AGENT]  TITLE`, newest first; trailing note about SIZE bridge. | 0 |
| `export` | `<uuid\|prefix>` `<dst-folder>` | Resolve to exactly one session; stage `<uuid>.jsonl` (home-tokenized), optional `<uuid>/` sidecar (tokenized), `manifest.json`; write `<dst>/<uuid>.tar.gz`. Print path + contents. | 0 ok / 2 no-match / 3 ambiguous / 4 bad-args |
| `import` | `<archive>` | Sniff `.tar.gz` or legacy `.zip`; extract; read manifest; detokenize `${CSP_HOME}` -> current home; land `<uuid>.jsonl` (+ sidecar) into `~/.claude/projects/<encodeCwd(cwd)>/`. Refuse overwrite. Print landing path + expected `/resume` size. | 0 / 2 bad-zip / 5 exists / 4 bad-args |
| `delete` | `<uuid\|prefix>` `[--hard]` `[--yes]` | Resolve to exactly one. Default: send `.jsonl` + sidecar to native trash (fallback quarantine). `--hard`: permanent; requires `--yes` or aborts asking the caller to confirm. | 0 / 2 no-match / 3 ambiguous |

`list` also exposes `--show <uuid|prefix>` (read-only target info) used by the delete wrapper.

## Manifest schema (v2)

```json
{
  "schemaVersion": 2,
  "uuid": "<uuid>",
  "sourceProjectPath": "/Users/you/my-app",
  "encodedSource": "-Users-you-my-app",
  "sourceOS": "darwin",
  "sourceHome": "/Users/you",
  "homeTokenized": true,
  "jsonlBytes": 2012664,
  "hasSidecar": true
}
```
Import is backward compatible: a v0.1.0 manifest (no `schemaVersion`/`homeTokenized`) is
treated as `homeTokenized:false` and landed as-is.

## Path remap

- **tokenizeHome(text, home):** replace every literal occurrence of `home` with the token
  `${CSP_HOME}`. Match both the OS-native form and a normalized forward-slash form of `home`
  so Windows `C:\Users\you` and `C:/Users/you` are both caught. Case-insensitive on Windows
  drive paths.
- **detokenizeHome(text, home):** replace `${CSP_HOME}` with the **current** machine's home
  in that machine's native separator.
- Applied only to the home prefix (the "obvious paths"). The project folder itself is
  re-derived from cwd on import, so resume works regardless; tokenizing is cosmetic polish for
  scrolled-back history. Do NOT rewrite arbitrary path-like strings.
- Edge case: if `homeTokenized` is false (legacy), skip detokenize.

## Archive

- **createTarGz:** `tar -czf <outFile> -C <stageDir> .` Spawn via `child_process` with args
  array (no shell string) to avoid quoting bugs with spaces.
- **extract:** `tar -xzf <archive> -C <destDir>` for `.tar.gz`; for legacy `.zip` use
  `tar -xf <archive> -C <destDir>` (bsdtar reads zip) with a fallback note.
- **sniffFormat:** by extension first; if ambiguous, read magic bytes (`1f 8b` = gzip,
  `50 4b` = zip).
- Require `tar` on PATH; if absent, print an actionable error.

## Trash (platform/trash.mjs)

`sendToTrash(absPath)`:
- **win32:** spawn `powershell -NoProfile -Command` using
  `Microsoft.VisualBasic.FileIO.FileSystem` SendToRecycleBin (port of current behavior).
- **darwin:** `osascript -e 'tell application "Finder" to delete POSIX file "<path>"'`.
- **linux:** `gio trash <path>` if `gio` exists; else `trash` (trash-cli) if it exists; else
  fallback.
- **fallback (any OS, no native tool):** move into `~/.claude/.trash-sessions/<uuid>/` and
  report that location. Never silently hard-delete.

## Command wrappers (new thin `.md` bodies)

Each `commands/*.md` keeps its frontmatter (`description`, `argument-hint`) but `allowed-tools`
becomes `Bash` and the body becomes an instruction to run the CLI, e.g. `export_uuid.md`:

> Parse `$ARGUMENTS` into `<uuid> <dst>`; if missing, print usage. Then run:
> `node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" export $ARGUMENTS`
> and print the output verbatim.

`delete_uuid.md` keeps the safety flow: for `--hard`, the wrapper runs `cli.mjs list --show`,
asks the user to type `yes`, and only then runs `cli.mjs delete <uuid> --hard --yes`.

## Tests (node:test, zero-dep)

- `tests/fixtures/` — small hand-made `.jsonl` transcripts (a normal one, an `agent-setting`
  one, one containing a home path to exercise remap) + an expected manifest.
- `tests/*.test.mjs` assert:
  - `encodeCwd` maps Windows / mac / Linux sample paths to the expected encoded folder
    (platform injected — runs on any OS).
  - `tokenizeHome` then `detokenizeHome` round-trips to a *different* home (cross-OS sim).
  - `manifest` build/parse round-trip; legacy manifest handled.
  - `archive` create -> extract reproduces the staged files byte-for-byte (real `tar`).
  - `sessions.resolveOne` returns 0/1/many correctly.
  - `trash` fallback moves a temp file into a quarantine dir (force fallback path in test).
  - `titles`/`gitBranch`/`isAgent` parse fixtures correctly.
- **CI cannot test** that Claude Code's `/resume` actually picks up an imported session (needs
  the live app). State this in the test README and the project README.

## CI

`.github/workflows/ci.yml`: trigger on `push` and `pull_request`. Matrix
`[windows-latest, macos-latest, ubuntu-latest]`, `actions/setup-node@v4` (node 20), steps:
`node --check` on every `.mjs`, then `node --test`. Badge added to README.

## .gitignore updates

- Keep ignoring real user data, but **un-ignore test fixtures**: add `!tests/fixtures/` and
  `!tests/fixtures/**` after the `*.jsonl`/`manifest.json` rules.
- Add build artifacts: `*.tar.gz`.

## Docs to update

- **README:** flip platform badge to Win/mac/Linux; add CI badge; update install (unchanged);
  note archive is `.tar.gz` (legacy `.zip` still importable); update Limitations
  (cross-OS now supported; resume verified on Windows, file-verified via CI on mac/Linux);
  Compatibility note Node ≥18.
- **CHANGELOG:** new `## [0.2.0]` entry (cross-OS Node CLI, tar.gz, path remap, CI).
- **docs/session-format.md:** add the v2 manifest + `${CSP_HOME}` token + `.tar.gz`.
- **CONTRIBUTING:** update the round-trip test to the Node CLI + `node --test` + CI.

## Out of scope

- Deep path rewriting beyond the home prefix.
- Continuous/whole-`.claude` sync.
- Encryption (transport is the user's choice).

## Verification

- CI matrix green on all three OSes (the parity guarantee).
- Maintainer confirms live `/resume` round-trip on Windows.
- Agent writes tests; the maintainer/CI run the suite (do not run the full suite inline).
