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

if (Test-Path -LiteralPath $StatePath) {
  try {
    $state = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($state.injectorPid) { Stop-Process -Id ([int]$state.injectorPid) -Force -ErrorAction SilentlyContinue }
    if (-not $ThemePath -and $state.themePath) { $ThemePath = $state.themePath }
  } catch {}
  Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Milliseconds 250
try { & $node $injector --remove --port $Port --timeout-ms 3000 } catch {}

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

Write-Host 'The active Codex Theme Studio theme was removed.'
