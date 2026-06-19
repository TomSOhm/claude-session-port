---
description: List this project's resume sessions - UUID, size, age, branch, title (newest first)
allowed-tools: Bash
---
List the saved sessions for the CURRENT project folder. This maps any `/resume` picker row
to its UUID.

Run the bundled cross-OS Node CLI and print its output verbatim (do NOT summarize or
reorder):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" list
```

The picker shows: title, age, git-branch, **size** (+ optional PR ref) - **no message
count**. **SIZE is the exact bridge** (file size == picker size, binary MB/KB) - find the
picker row's size in this list, copy that UUID into `/export_uuid` or `/delete_uuid`. Branch
and age disambiguate. The title is only a hint; it is NOT the picker's displayed title (the
picker derives that with logic that can't be read from disk).

Rows flagged **AGENT** are teammate/sub-agent sessions (first record `agent-setting`) - the
picker **hides** these. The current live session is also hidden from the picker (you can't
resume the one you're in). So `/resume` = this list minus AGENT rows minus the current
session.
