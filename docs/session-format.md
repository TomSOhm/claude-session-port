# Claude Code session format & storage layout

Reference for how `claude-session-port` locates and moves sessions. This describes
Claude Code's **undocumented** on-disk layout as observed; it can change between releases.

## Where sessions live

```
~/.claude/projects/<encoded-cwd>/<uuid>.jsonl      # the transcript (= the context)
~/.claude/projects/<encoded-cwd>/<uuid>/           # optional sidecar dir (subagent transcripts)
```

- `~` is `%USERPROFILE%` on Windows, `$HOME` on macOS/Linux.
- `<uuid>` is the session id - it is the filename, and also appears on every line of the
  transcript.
- `<encoded-cwd>` is the project's **absolute path** with **every non-alphanumeric
  character replaced by `-`**. Examples:
  - Windows `C:\Users\you\my-app` -> `C--Users-you-my-app` (`:` and both `\` each become `-`)
  - macOS/Linux `/Users/you/my-app` -> `-Users-you-my-app` (leading `/` becomes `-`)

Because the folder is derived from the absolute path, a session is only discoverable by
`/resume` when you run Claude Code from a directory that encodes to the **same** folder
name. This is why `/import_uuid` must be run from the matching repo directory.

## The transcript (`.jsonl`)

Append-only JSON Lines - one JSON object per line (user messages, assistant messages, tool
use, metadata). Append-only means it is safe to copy as a plain file. Useful fields the
commands read from the first lines:

- `"gitBranch":"…"` - branch the session was on (shown in the listing).
- `"type":"agent-setting"` - present in subagent/teammate sessions; `/resume` hides these.
- `"type":"user"` … `message.content` - first real user prompt, used as the title hint.

> Claude Code flushes the transcript to disk **on exit**. Export a session from a different
> session, or after exiting the one you want to move.

## The export bundle (`<uuid>.tar.gz`)

`/export_uuid` stages and archives the following into `<dst>/<uuid>.tar.gz` (created with the
system `tar`, which ships on Windows 10+, macOS, and Linux; both bsdtar and the GNU tar
bundled with Git for Windows are handled):

```
<uuid>.jsonl        # the transcript (home prefix tokenized to ${CSP_HOME})
<uuid>/             # the sidecar dir, if it exists (each file also tokenized)
manifest.json       # metadata written by /export_uuid (schema v2)
```

Import accepts a `.tar.gz` (or a legacy v0.1.0 `.zip`); the format is sniffed by extension,
and by magic bytes when ambiguous (`1f 8b` = gzip, `50 4b` = zip).

### `manifest.json` (schema v2)

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

- `schemaVersion` - `2` for current exports.
- `sourceOS` - the source platform (`win32` / `darwin` / `linux`).
- `sourceHome` - the source machine's home directory (the prefix that was tokenized).
- `homeTokenized` - `true` when the transcript's home prefix was replaced with `${CSP_HOME}`.

`/import_uuid` reads `manifest.json` to recover the UUID, detokenizes `${CSP_HOME}` (when
`homeTokenized` is true), and reports the source project path and the expected `/resume` row
size.

**Legacy bundles.** A v0.1.0 manifest has no `schemaVersion`/`homeTokenized` and is read as
`schemaVersion: 1`, `homeTokenized: false`; such a bundle is landed as-is without remapping.

## The `${CSP_HOME}` home-token remap

To keep transferred transcripts readable across usernames and operating systems, the
**home-directory prefix** is tokenized (not a deep path rewrite):

- **On export:** every literal occurrence of the source home (in both the OS-native and
  forward-slash form, case-insensitively for Windows drive paths) is replaced with the token
  `${CSP_HOME}` in the `.jsonl` and any sidecar files.
- **On import:** `${CSP_HOME}` is replaced with the **destination** machine's home in its
  native separator.

Only the home prefix is touched - arbitrary path-like strings are left alone. The project
folder itself is re-derived from the current working directory on import, so `/resume` works
regardless of the source path; tokenizing is cosmetic polish for scrolled-back history.

## The SIZE -> picker bridge

The `/resume` picker displays each session's **title, age, git-branch, size** - but
**not** its UUID. `/resume_title_uuid` lists `UUID, size, age, branch, title`, so the
session **file size** (binary KB/MB) is the reliable key to match a picker row to its UUID.
Title is only a hint (the picker derives its displayed title with logic that can't be read
from disk); branch and age help disambiguate.

## Caveats when moving across machines

- **Only the home prefix is remapped.** The transcript's home prefix is tokenized on export
  and remapped to the destination home on import, so paths under home read cleanly. Paths
  outside home are left unchanged; resume works regardless, since the project folder is
  re-derived from the current directory.
- **Code is not included.** The bundle moves the *conversation*, not your repository. Sync
  the code separately with git.
- **Version sensitivity.** The layout is undocumented and has changed across Claude Code
  releases before. If `/resume` stops recognizing imported sessions after an update, the
  format likely changed - please open an issue.
