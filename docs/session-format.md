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
  - Windows `C:\Users\you\my-app` → `C--Users-you-my-app` (`:` and both `\` each become `-`)
  - macOS/Linux `/Users/you/my-app` → `-Users-you-my-app` (leading `/` becomes `-`)

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

## The export bundle (`<uuid>.zip`)

`/export_uuid` stages and zips:

```
<uuid>.jsonl        # the transcript
<uuid>/             # the sidecar dir, if it exists
manifest.json       # metadata written by /export_uuid
```

`manifest.json`:

```json
{
  "uuid": "<uuid>",
  "sourceProjectPath": "C:\\Users\\you\\my-app",
  "encodedSource": "C--Users-you-my-app",
  "jsonlBytes": 2012664,
  "hasSidecar": true
}
```

`/import_uuid` reads `manifest.json` to recover the UUID and reports the source project
path and the expected `/resume` row size.

## The SIZE → picker bridge

The `/resume` picker displays each session's **title · age · git-branch · size** - but
**not** its UUID. `/resume_title_uuid` lists `UUID · size · age · branch · title`, so the
session **file size** (binary KB/MB) is the reliable key to match a picker row to its UUID.
Title is only a hint (the picker derives its displayed title with logic that can't be read
from disk); branch and age help disambiguate.

## Caveats when moving across machines

- **Paths are absolute.** The transcript embeds the source machine's paths. Resume works,
  but old paths appear in history and new work uses the destination machine's paths. Within
  the same OS and username this is invisible; across OSes it is noticeable. Cross-OS path
  remapping is on the roadmap.
- **Code is not included.** The bundle moves the *conversation*, not your repository. Sync
  the code separately with git.
- **Version sensitivity.** The layout is undocumented and has changed across Claude Code
  releases before. If `/resume` stops recognizing imported sessions after an update, the
  format likely changed - please open an issue.
