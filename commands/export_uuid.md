---
description: Export one local session (zip + manifest) to a destination folder for use on another machine
argument-hint: <uuid|prefix> <dst-folder>
allowed-tools: Bash
shell: powershell
---
Arguments: $ARGUMENTS

Export a saved Claude Code session as a portable zip so it can be resumed on another machine.
Steps:

1. Parse $ARGUMENTS: first token = UUID (full or prefix ≥8 chars); the REST = destination folder
   `<dst>` (may contain spaces; strip surrounding quotes). If either missing, STOP and print usage:
   `/export_uuid <uuid|prefix> <dst-folder>`.
2. Substitute into `$uuid='...'` and `$dst='...'` below and run it.
3. Report the zip path and contents. Tell the user: on the other machine, run `/import_uuid <zip>`
   FROM that repo's directory (the project folder is derived from the current dir).

The zip holds: `<uuid>.jsonl` (the transcript = the context), the `<uuid>/` sidecar dir (subagent
transcripts) if present, and `manifest.json` (uuid + source project path). It does NOT transfer your
repo code - sync that separately via git.

```powershell
$uuid='<UUID>'; $dst='<DST>'
$enc=((Get-Location).Path -replace '[^A-Za-z0-9]','-'); $base=Join-Path $env:USERPROFILE ".claude\projects\$enc"
$m = Get-ChildItem $base -Filter *.jsonl | Where-Object { $_.BaseName -like "$uuid*" }
if (-not $m) { Write-Output "NO MATCH for '$uuid' in $base"; return }
if ($m.Count -gt 1) { Write-Output "AMBIGUOUS - $($m.Count) matches:"; $m.BaseName; return }
$full=$m[0].BaseName; $file=$m[0].FullName; $side=Join-Path $base $full
if (-not (Test-Path $dst)) { New-Item -ItemType Directory -Force -Path $dst | Out-Null }
$stage=Join-Path $env:TEMP "xfer-$full"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null
Copy-Item $file (Join-Path $stage "$full.jsonl")
$hasSide = Test-Path $side
if ($hasSide) { Copy-Item $side (Join-Path $stage $full) -Recurse }
$manifest = [ordered]@{ uuid=$full; sourceProjectPath=(Get-Location).Path; encodedSource=$enc; jsonlBytes=$m[0].Length; hasSidecar=$hasSide } | ConvertTo-Json
Set-Content -Path (Join-Path $stage "manifest.json") -Value $manifest -Encoding UTF8
$zip=Join-Path $dst "$full.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip
Remove-Item $stage -Recurse -Force
Write-Output "Exported: $zip ($([int]((Get-Item $zip).Length/1KB)) KB)"
Write-Output ("contents: {0}.jsonl{1} + manifest.json" -f $full, $(if($hasSide){" + sidecar"}else{""}))
```
