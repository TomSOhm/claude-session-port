---
description: Import a session archive (from /export_uuid) into THIS machine's project so /resume finds it
argument-hint: <path-to-uuid.tar.gz>
allowed-tools: Bash
---
Arguments: $ARGUMENTS

Import a session exported by `/export_uuid` into the CURRENT project on this machine
(Windows, macOS, or Linux). Steps:

1. Parse $ARGUMENTS as one path `<src>` to the archive (`.tar.gz`, or a legacy v0.1.0 `.zip`;
   may contain spaces). If missing, STOP and print usage:
   `/import_uuid <path-to-uuid.tar.gz>`.
2. Run the bundled cross-OS Node CLI, passing the argument through unchanged, and print its
   output verbatim:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" import $ARGUMENTS
   ```

   It lands the session in `~/.claude/projects/<encoded-current-dir>/` - so it MUST be run from
   the repo directory you want to resume in (the folder name is derived from the cwd). It
   refuses to overwrite an existing session of the same UUID.
3. After success, tell the user to run `/resume` here and pick the row by its size.

Note: the import detokenizes the source home prefix (`${CSP_HOME}`) back to this machine's
home, so paths under home read cleanly. Resume works regardless; new work uses this machine's
paths. Make sure the repo code itself is synced (git) separately.
