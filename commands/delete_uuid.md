---
description: Delete one local session by UUID. Default = native trash (recoverable); --hard = permanent.
argument-hint: <uuid|prefix> [--hard]
allowed-tools: Bash
---
Arguments: $ARGUMENTS

Delete a saved Claude Code session for the CURRENT project, using the bundled cross-OS Node
CLI. Default sends it to the OS native trash (Recycle Bin on Windows, Finder Trash on macOS,
`gio trash`/`trash-cli` on Linux, with a quarantine-folder fallback where no native trash
exists). Follow exactly:

1. Parse $ARGUMENTS into one UUID (full, or prefix of >= 8 chars) + optional `--hard`. If no
   UUID, STOP and print usage: `/delete_uuid <uuid|prefix> [--hard]`.
2. **No `--hard` (default, recoverable):** run the delete directly and print its output
   verbatim:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" delete <uuid>
   ```

   The CLI re-resolves the UUID and aborts on 0 or > 1 matches; it is recoverable, so no
   confirm is needed. If it reports NO MATCH or AMBIGUOUS, ask the user for a longer prefix.
3. **`--hard` (permanent, cannot be undone):** first show the target read-only:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" list --show <uuid>
   ```

   Then ASK the user: "Type `yes` to permanently delete (cannot be undone)". WAIT for the
   reply. Only on `yes`, run:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" delete <uuid> --hard --yes
   ```

   Otherwise abort - nothing is deleted.

Never touch `memory`. Never guess on ambiguity (if `list --show` reports AMBIGUOUS, ask for a
longer prefix). If the target is the session the user is currently in, warn them it will
re-save on exit (deleting it now is usually pointless).
