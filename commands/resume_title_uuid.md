---
description: List this project's resume sessions - UUID, size, age, branch, title (newest first)
allowed-tools: Bash
shell: powershell
---
Run the PowerShell below via the PowerShell tool and print its output verbatim (do NOT
summarize or reorder). It lists the saved sessions for the CURRENT project folder and is built to
map any `/resume` picker row to its UUID.

The picker shows: title · age · git-branch · **size** (+ optional PR ref) - **no message count**.
**SIZE is the exact bridge** (file size == picker size, binary MB/KB) - find the picker row's size
here, copy that UUID into /delete_uuid. Branch + age disambiguate. The title is only a hint; it is
NOT the picker's displayed title (the picker derives that with logic that can't be read from disk).

Rows flagged **AGENT** are teammate/sub-agent sessions (first record `agent-setting`) - the picker
**hides** these. The current live session is also hidden from the picker (you can't resume the one
you're in). So `/resume` = this list minus AGENT rows minus the current session.

```powershell
$enc  = ((Get-Location).Path -replace '[^A-Za-z0-9]','-')
$base = Join-Path $env:USERPROFILE ".claude\projects\$enc"
if (-not (Test-Path $base)) { Write-Output "No session folder for this project: $base"; return }
$ci = [System.Globalization.CultureInfo]::InvariantCulture
function Fmt-Size($b){ if($b -ge 1048576){ ($b/1048576).ToString('0.#',$ci)+'MB' } else { ($b/1024).ToString('0.#',$ci)+'KB' } }
function Get-Branch($path){ $r=[System.IO.File]::OpenText($path); try{ $n=0; while(($l=$r.ReadLine()) -ne $null -and $n -lt 60){ $n++; if($l -match '"gitBranch":"([^"]+)"'){ return $Matches[1] } } } finally{$r.Close()}; return '-' }
function Is-Agent($path){ $r=[System.IO.File]::OpenText($path); try{ $n=0; while(($l=$r.ReadLine()) -ne $null -and $n -lt 5){ $n++; if($l -match '"type":"agent-setting"'){ return $true } } } finally{$r.Close()}; return $false }
function Get-Title($path) {
  $r = [System.IO.File]::OpenText($path)
  try {
    while (($line = $r.ReadLine()) -ne $null) {
      if ($line -notmatch '"type":"user"') { continue }
      try { $o = $line | ConvertFrom-Json } catch { continue }
      $c = $o.message.content
      if ($c -is [string]) { $t = $c }
      elseif ($c) { $t = ($c | Where-Object { $_.type -eq 'text' } | Select-Object -First 1).text }
      else { continue }
      if (-not $t) { continue }
      $t = ($t.Trim() -replace '\s+',' ')
      if ($t -match '^(<|\[|##\s|Base directory for this skill|A session-scoped)') { continue }
      return $t.Substring(0, [Math]::Min(48, $t.Length))
    }
  } finally { $r.Close() }
  return '(no user prompt)'
}
Get-ChildItem $base -Filter *.jsonl | Sort-Object LastWriteTime -Descending | ForEach-Object {
  $age=(Get-Date)-$_.LastWriteTime
  $rel= if($age.TotalDays -ge 1){"{0}d ago" -f [int]$age.TotalDays}elseif($age.TotalHours -ge 1){"{0}h ago" -f [int]$age.TotalHours}else{"{0}m ago" -f [int]$age.TotalMinutes}
  $flag = if(Is-Agent $_.FullName){'AGENT'}else{'     '}
  "{0}  {1,8}  {2,-9} {3,-30} {4}  {5}" -f $_.BaseName, (Fmt-Size $_.Length), $rel, (Get-Branch $_.FullName), $flag, (Get-Title $_.FullName)
}
Write-Output ""
Write-Output "match key = SIZE (== /resume). AGENT rows + the current session are hidden from /resume."
```
