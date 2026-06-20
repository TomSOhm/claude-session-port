# Contributing

Thanks for your interest! This is a small, focused tool - contributions that keep it small
and portable are very welcome.

## Good first contributions

- **Deeper path remapping** - today only the home prefix is tokenized (`${CSP_HOME}`).
  Rewriting other machine-specific path-like strings could make scrolled-back history read
  even more cleanly, without corrupting transcript content.
- **More CLI test fixtures** - add hand-made `.jsonl` transcripts and cases under `tests/` to
  cover more session shapes.
- **Compatibility reports** - tell us which Claude Code versions and operating systems a
  command works (or breaks) on, especially live `/resume` pickup on macOS and Linux.

## How the commands work

Each command is a Markdown file in `commands/` with YAML frontmatter
(`description`, `argument-hint`, `allowed-tools`) followed by short instructions. The body is
a **thin wrapper**: Claude Code reads the file, parses `$ARGUMENTS`, and runs the bundled,
zero-dependency Node CLI via
`node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" <list|export|import|delete> $ARGUMENTS`, then
prints the output verbatim. All the real logic lives in `scripts/` (`cli.mjs` dispatches to
`scripts/commands/*.mjs`, which build on the pure helpers in `scripts/core/`); there is no
build step and no runtime dependencies.

Sessions live at `~/.claude/projects/<encoded-cwd>/<uuid>.jsonl`, where `<encoded-cwd>` is
the absolute project path with every non-alphanumeric character replaced by `-`. See
[docs/session-format.md](docs/session-format.md).

## Tests

The CLI is covered by the built-in `node:test` runner (no test dependencies):

```bash
node --test
```

CI runs `node --check` on every `.mjs` plus `node --test` on a matrix of
`windows-latest`, `macos-latest`, and `ubuntu-latest` for every push and pull request, so the
file mechanics are proven on all three operating systems. CI **cannot** drive the Claude Code
app, so live `/resume` pickup of an imported session is verified separately by the maintainer.

## Manual round-trip test

The core behavior to preserve is a clean export -> import -> resume cycle. On a throwaway
project with at least one saved session:

1. `/resume_title_uuid` - note a UUID and its size.
2. `/export_uuid <uuid> <some-folder>` - confirm a `<uuid>.tar.gz` containing a
   `manifest.json`.
3. `/delete_uuid <uuid>` - confirm it moved to the OS native trash.
4. `/import_uuid <some-folder>/<uuid>.tar.gz` - confirm it lands in the project folder.
5. `/resume` - confirm the row reappears, matched by its size.

You can also drive the CLI directly without Claude Code:
`node scripts/cli.mjs export <uuid> <folder>` (and `import` / `list` / `delete`). If you add a
fixture or behavior, run the same cycle on your OS and let CI cover the others.

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
