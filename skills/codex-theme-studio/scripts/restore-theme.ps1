[CmdletBinding()]
param(
  [int]$Port = 9335,
  [string]$ThemePath,
  [switch]$Uninstall,
  [switch]$RestoreBaseTheme
)

$ErrorActionPreference = 'Stop'
$node = (Get-Command node -ErrorAction Stop).Source
$injector = Join-Path $PSScriptRoot 'theme-injector.mjs'
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexThemeStudio'
$StatePath = Join-Path $StateRoot 'state.json'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false, $true)

function Test-CodexDebugPort([int]$CandidatePort) {
  foreach ($endpoint in @('127.0.0.1', '[::1]', 'localhost')) {
    try {
      $targets = Invoke-RestMethod "http://${endpoint}:$CandidatePort/json/list" -TimeoutSec 1
      if ($targets | Where-Object { $_.type -eq 'page' -and $_.url -like 'app://*' }) { return $true }
    } catch {}
  }
  return $false
}

function Stop-ThemeInjectorFromState($SavedState) {
  if (-not $SavedState -or -not $SavedState.injectorPid) { return $false }
  $process = Get-Process -Id ([int]$SavedState.injectorPid) -ErrorAction SilentlyContinue
  if (-not $process -or $process.ProcessName -ne 'node') { return $false }
  $commandLine = (Get-CimInstance Win32_Process -Filter "ProcessId=$($process.Id)" -ErrorAction SilentlyContinue).CommandLine
  if ($commandLine -notlike '*theme-injector.mjs*--watch*') { return $false }
  if ($SavedState.injectorStartedAt) {
    $savedStart = [datetime]::Parse($SavedState.injectorStartedAt).ToUniversalTime()
    if ([math]::Abs(($process.StartTime.ToUniversalTime() - $savedStart).TotalSeconds) -gt 2) { return $false }
  }
  Stop-Process -Id $process.Id -Force
  return $true
}

$state = $null
if (Test-Path -LiteralPath $StatePath) {
  try {
    $state = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($state.port) { $Port = [int]$state.port }
    if ($state.injectorPid -and -not (Stop-ThemeInjectorFromState $state)) { Write-Warning 'Saved injector PID was stale or did not belong to Theme Studio; it was not terminated.' }
    if (-not $ThemePath -and $state.themePath) { $ThemePath = $state.themePath }
  } catch {}
}
Start-Sleep -Milliseconds 250
& $node $injector --remove --port $Port --timeout-ms 3000
$removeExit = $LASTEXITCODE
if ($removeExit -ne 0 -and (Test-CodexDebugPort $Port)) {
  throw "The Codex renderer is reachable on port $Port, but live theme removal failed. State was preserved for retry."
}
if ($removeExit -ne 0) { Write-Warning "No Codex renderer was reachable on port $Port; the injector was stopped and saved state was cleared." }
if (Test-Path -LiteralPath $StatePath) { Remove-Item -LiteralPath $StatePath -Force }

if ($Uninstall -and $ThemePath -and (Test-Path -LiteralPath $ThemePath)) {
  $theme = Get-Content -LiteralPath (Join-Path $ThemePath 'theme.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $safeName = [regex]::Replace($theme.displayName, '[\\/:*?"<>|]', '-')
  $desktop = [Environment]::GetFolderPath('Desktop')
  $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
  foreach ($shortcut in @((Join-Path $desktop "Codex - $safeName.lnk"), (Join-Path $startMenu "Codex - $safeName.lnk"))) {
    Remove-Item -LiteralPath $shortcut -Force -ErrorAction SilentlyContinue
  }
}

if ($RestoreBaseTheme) {
  $backup = Join-Path $StateRoot 'config.before-theme-studio.toml'
  $config = Join-Path $env:USERPROFILE '.codex\config.toml'
  if (-not (Test-Path -LiteralPath $backup)) { throw 'No pre-install config backup is available.' }
  $backupContent = [System.IO.File]::ReadAllText($backup, $Utf8NoBom)
  $currentContent = [System.IO.File]::ReadAllText($config, $Utf8NoBom)
  foreach ($key in @('appearanceTheme', 'appearanceLightCodeThemeId', 'appearanceLightChromeTheme')) {
    $pattern = "(?m)^$([regex]::Escape($key))\s*=.*(?:\r?\n)?"
    $saved = [regex]::Match($backupContent, $pattern)
    if ([regex]::IsMatch($currentContent, $pattern)) {
      $replacement = if ($saved.Success) { $saved.Value.TrimEnd("`r", "`n") + "`r`n" } else { '' }
      $currentContent = [regex]::Replace($currentContent, $pattern, $replacement, 1)
    }
  }
  [System.IO.File]::WriteAllText($config, $currentContent, $Utf8NoBom)
}

if ($RestoreBaseTheme) { Write-Host 'The theme was removed and the original palette was restored. Reopen Codex to reload the native window colors.' }
else { Write-Host 'The live theme injection was removed; the saved Codex palette was left unchanged.' }
