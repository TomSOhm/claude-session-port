# Contributing

Thanks for your interest! This is a small, focused tool - contributions that keep it small
and portable are very welcome.

## Good first contributions

- **macOS/Linux backend** for any of the four commands.
- **The Node rewrite** - port the embedded PowerShell to a single bundled
  `scripts/cli.mjs` invoked via `node ${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs <cmd> …`, so one
  codebase runs everywhere Claude Code does.
- **Path remapping on import** - rewrite the source machine's `${HOME}`/cwd tokens to the
  destination's so a session moves cleanly across usernames and operating systems.
- **Compatibility reports** - tell us which Claude Code versions a command works (or breaks)
  on.

## How the commands work

Each command is a Markdown file in `commands/` with YAML frontmatter
(`description`, `argument-hint`, `allowed-tools`, `shell`) followed by instructions and a
PowerShell script. Claude Code reads the file, parses `$ARGUMENTS`, and runs the script.
There is no build step.

Sessions live at `~/.claude/projects/<encoded-cwd>/<uuid>.jsonl`, where `<encoded-cwd>` is
the absolute project path with every non-alphanumeric character replaced by `-`. See
[docs/session-format.md](docs/session-format.md).

## Manual round-trip test

The core behavior to preserve is a clean export → import → resume cycle. On a throwaway
project with at least one saved session:

1. `/resume_title_uuid` - note a UUID and its size.
2. `/export_uuid <uuid> <some-folder>` - confirm a `<uuid>.zip` with a `manifest.json`.
3. `/delete_uuid <uuid>` - confirm it moved to the Recycle Bin.
4. `/import_uuid <some-folder>\<uuid>.zip` - confirm it lands in the project folder.
5. `/resume` - confirm the row reappears, matched by its size.

If you add an OS backend, run the same cycle on that OS.

## Conventions

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`,
  `fix:`, `docs:`, …).
- **Safety first:** destructive paths must default to recoverable (Recycle Bin / Trash) and
  require explicit confirmation for permanent deletion. Never act on an ambiguous UUID
  prefix.
- **No personal data** in commits - the commands are parameterized; keep them that way.
- Keep the tool dependency-free where possible.

## Reporting bugs

Open an issue with: your OS, your Claude Code version (`claude --version`), the command you
ran, and the output. For format-breakage after a Claude Code update, please include the
version that last worked.
