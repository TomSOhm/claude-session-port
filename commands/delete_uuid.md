---
description: Delete one local session by UUID. Default = Recycle Bin (recoverable); --hard = permanent.
argument-hint: <uuid|prefix> [--hard]
allowed-tools: Bash
shell: powershell
---
Arguments: $ARGUMENTS

Delete a saved Claude Code session for the CURRENT project. Follow exactly:

1. Parse $ARGUMENTS into one UUID (full, or prefix of ≥8 chars) + optional `--hard`. If no
   UUID, STOP and print usage: `/delete_uuid <uuid|prefix> [--hard]`.
2. Substitute the UUID into `$uuid='...'` in the scripts below.
3. **No `--hard` (default → Recycle Bin):** run TRASH. It re-resolves and aborts if 0 or >1
   match; recoverable, so no confirm needed. Report what moved. If it prints ABORT, run SHOW
   and ask the user for a longer prefix.
4. **`--hard` (permanent):** run SHOW, then ASK "Type yes to permanently delete (cannot be
   undone)". WAIT for the reply. Only on `yes`, run HARD. Otherwise abort, nothing deleted.

Never touch `memory\`. Never guess on ambiguity. If the target is the session the user is
currently in, warn them it will re-save on exit (deleting it now is usually pointless).

--- SHOW (read-only) ---
```powershell
$uuid='<UUID>'
$enc=((Get-Location).Path -replace '[^A-Za-z0-9]','-'); $base=Join-Path $env:USERPROFILE ".claude\projects\$enc"
$m = Get-ChildItem $base -Filter *.jsonl | Where-Object { $_.BaseName -like "$uuid*" }
if (-not $m) { Write-Output "NO MATCH for '$uuid' in $base"; return }
if ($m.Count -gt 1) { Write-Output "AMBIGUOUS - $($m.Count) matches:"; $m.BaseName; return }
$dir = Join-Path $base $m[0].BaseName
Write-Output "TARGET uuid : $($m[0].BaseName)"
Write-Output "file        : $($m[0].FullName)  ($([int]($m[0].Length/1KB)) KB)"
Write-Output "sidecar dir : $(if (Test-Path $dir) { $dir } else { '(none)' })"
```

--- TRASH (Recycle Bin; recoverable) ---
```powershell
$uuid='<UUID>'
$enc=((Get-Location).Path -replace '[^A-Za-z0-9]','-'); $base=Join-Path $env:USERPROFILE ".claude\projects\$enc"
$m = Get-ChildItem $base -Filter *.jsonl | Where-Object { $_.BaseName -like "$uuid*" }
if (-not $m -or $m.Count -gt 1) { Write-Output "ABORT: not exactly one match for '$uuid'"; return }
$file=$m[0].FullName; $dir=Join-Path $base $m[0].BaseName
Add-Type -AssemblyName Microsoft.VisualBasic
[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($file,'OnlyErrorDialogs','SendToRecycleBin')
if (Test-Path $dir) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($dir,'OnlyErrorDialogs','SendToRecycleBin') }
Write-Output "Moved to Recycle Bin: $($m[0].BaseName)"
```

--- HARD (permanent; ONLY after user typed yes) ---
```powershell
$uuid='<UUID>'
$enc=((Get-Location).Path -replace '[^A-Za-z0-9]','-'); $base=Join-Path $env:USERPROFILE ".claude\projects\$enc"
$m = Get-ChildItem $base -Filter *.jsonl | Where-Object { $_.BaseName -like "$uuid*" }
if (-not $m -or $m.Count -gt 1) { Write-Output "ABORT: not exactly one match for '$uuid'"; return }
$file=$m[0].FullName; $dir=Join-Path $base $m[0].BaseName
Remove-Item -LiteralPath $file -Force
if (Test-Path $dir) { Remove-Item -LiteralPath $dir -Recurse -Force }
Write-Output "Permanently deleted: $($m[0].BaseName)"
```
