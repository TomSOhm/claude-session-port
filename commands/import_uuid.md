---
description: Import a session zip (from /export_uuid) into THIS machine's project so /resume finds it
argument-hint: <path-to-uuid.zip>
allowed-tools: Bash
shell: powershell
---
Arguments: $ARGUMENTS

Import a session exported by `/export_uuid` into the CURRENT project on this machine. Steps:

1. Parse $ARGUMENTS as one path `<src>` to the `.zip` (may contain spaces; strip quotes). If missing
   or not found, STOP and print usage: `/import_uuid <path-to-uuid.zip>`.
2. Run the script below. It lands the session in `~/.claude/projects/<encoded-current-dir>/` - so it
   MUST be run from the repo directory you want to resume in (the folder name is derived from the cwd).
3. Refuse to overwrite an existing session of the same UUID (abort and tell the user). After success,
   tell them to run `/resume` here and pick the row by its size.

Note: the transcript carries the source machine's absolute paths - resume works, but old paths show in
history; new work uses this machine's paths. Make sure the repo code itself is synced (git) separately.

```powershell
$src='<SRC>'
if (-not (Test-Path $src)) { Write-Output "NO SRC: $src"; return }
$enc=((Get-Location).Path -replace '[^A-Za-z0-9]','-'); $base=Join-Path $env:USERPROFILE ".claude\projects\$enc"
if (-not (Test-Path $base)) { New-Item -ItemType Directory -Force -Path $base | Out-Null }
$tmp=Join-Path $env:TEMP ("import-" + [System.IO.Path]::GetFileNameWithoutExtension($src))
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
Expand-Archive -Path $src -DestinationPath $tmp
$manPath=Join-Path $tmp 'manifest.json'
if (-not (Test-Path $manPath)) { Write-Output "BAD ZIP: no manifest.json (not a /export_uuid export?)"; Remove-Item $tmp -Recurse -Force; return }
$man=Get-Content $manPath -Raw | ConvertFrom-Json
$uuid=$man.uuid
$srcJsonl=Join-Path $tmp "$uuid.jsonl"
$dstJsonl=Join-Path $base "$uuid.jsonl"
if (Test-Path $dstJsonl) { Write-Output "ALREADY EXISTS: $dstJsonl - aborting (delete it first to replace)."; Remove-Item $tmp -Recurse -Force; return }
Copy-Item $srcJsonl $dstJsonl
$srcSide=Join-Path $tmp $uuid
if (Test-Path $srcSide) { Copy-Item $srcSide (Join-Path $base $uuid) -Recurse }
Remove-Item $tmp -Recurse -Force
Write-Output "Imported session $uuid -> $base"
Write-Output "from source project: $($man.sourceProjectPath)"
Write-Output ("Run /resume here; row size ~ {0}MB." -f ([math]::Round($man.jsonlBytes/1MB,1)))
```
