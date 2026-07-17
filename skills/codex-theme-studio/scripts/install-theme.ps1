[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ThemePath,
  [int]$Port = 9335,
  [switch]$NoShortcuts
)

$ErrorActionPreference = 'Stop'
$ThemePath = (Resolve-Path -LiteralPath $ThemePath).Path
$SkillRoot = Split-Path -Parent $PSScriptRoot
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexThemeStudio'
$ProfilePath = Join-Path $StateRoot 'profile'
$node = (Get-Command node -ErrorAction Stop).Source
$validator = Join-Path $PSScriptRoot 'validate-theme.mjs'
New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null
& $node $validator --theme $ThemePath *> $null
if ($LASTEXITCODE -ne 0) { throw "Theme validation failed: $ThemePath" }

$manifestPath = Join-Path $ThemePath 'theme.json'
$theme = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json

$iconPng = Join-Path $ThemePath $theme.assets.icon
$iconIco = if ($theme.assets.shortcutIcon) { Join-Path $ThemePath $theme.assets.shortcutIcon } else { Join-Path $ThemePath 'theme.ico' }
if (-not (Test-Path -LiteralPath $iconIco) -or (Get-Item $iconPng).LastWriteTimeUtc -gt (Get-Item $iconIco -ErrorAction SilentlyContinue).LastWriteTimeUtc) {
  & (Join-Path $PSScriptRoot 'build-icon.ps1') -InputPng $iconPng -OutputIco $iconIco
}

if (-not $NoShortcuts) {
  $shell = New-Object -ComObject WScript.Shell
  $desktop = [Environment]::GetFolderPath('Desktop')
  $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
  $powershell = (Get-Command powershell.exe).Source
  $startScript = Join-Path $PSScriptRoot 'start-theme.ps1'
  $restoreScript = Join-Path $PSScriptRoot 'restore-theme.ps1'
  $safeName = [regex]::Replace($theme.displayName, '[\\/:*?"<>|]', '-')
  foreach ($folder in @($desktop, $startMenu)) {
    $shortcut = $shell.CreateShortcut((Join-Path $folder "Codex - $safeName.lnk"))
    $shortcut.TargetPath = $powershell
    $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`" -ThemePath `"$ThemePath`" -Port $Port -ProfilePath `"$ProfilePath`""
    $shortcut.WorkingDirectory = $SkillRoot
    $shortcut.IconLocation = "$iconIco,0"
    $shortcut.Description = "Launch Codex with the $($theme.displayName) theme"
    $shortcut.Save()
  }
  $restore = $shell.CreateShortcut((Join-Path $desktop 'Codex Theme Studio - Restore.lnk'))
  $restore.TargetPath = $powershell
  $restore.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$restoreScript`" -Port $Port"
  $restore.WorkingDirectory = $SkillRoot
  $restore.IconLocation = "$iconIco,0"
  $restore.Description = 'Remove the active Codex Theme Studio theme'
  $restore.Save()
}

if ($NoShortcuts) { Write-Host "Prepared '$($theme.displayName)' without creating shortcuts." }
else { Write-Host "Installed '$($theme.displayName)'. Use the new desktop shortcut to launch it." }
