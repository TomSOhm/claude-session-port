---
description: Export one local session (.tar.gz + manifest) to a destination folder for use on another machine
argument-hint: <uuid|prefix> <dst-folder>
allowed-tools: Bash
---
Arguments: $ARGUMENTS

Export a saved Claude Code session as a portable `.tar.gz` so it can be resumed on another
machine (Windows, macOS, or Linux). Steps:

1. Parse $ARGUMENTS: first token = UUID (full or prefix of >= 8 chars); the REST = destination
   folder `<dst>` (may contain spaces). If either is missing, STOP and print usage:
   `/export_uuid <uuid|prefix> <dst-folder>`.
2. Run the bundled cross-OS Node CLI, passing the arguments through unchanged, and print its
   output verbatim:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" export $ARGUMENTS
   ```

3. Report the archive path and contents. Tell the user: on the other machine, run
   `/import_uuid <archive>` FROM that repo's directory (the project folder is derived from the
   current dir).

The archive holds: `<uuid>.jsonl` (the transcript = the context), the `<uuid>/` sidecar dir
(subagent transcripts) if present, and `manifest.json` (uuid + source project path, OS, and
home). The source machine's home prefix is tokenized to `${CSP_HOME}` so import can remap it.
It does NOT transfer your repo code - sync that separately via git.
