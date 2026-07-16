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
$ConfigPath = Join-Path $env:USERPROFILE '.codex\config.toml'
$BackupPath = Join-Path $StateRoot 'config.before-theme-studio.toml'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false, $true)
$node = (Get-Command node -ErrorAction Stop).Source
$validator = Join-Path $PSScriptRoot 'validate-theme.mjs'
New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null
& $node $validator --theme $ThemePath *> $null
if ($LASTEXITCODE -ne 0) { throw "Theme validation failed: $ThemePath" }

$manifestPath = Join-Path $ThemePath 'theme.json'
$theme = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not (Test-Path -LiteralPath $ConfigPath)) { throw "Codex config not found: $ConfigPath" }
if (-not (Test-Path -LiteralPath $BackupPath)) { Copy-Item -LiteralPath $ConfigPath -Destination $BackupPath }

$content = [System.IO.File]::ReadAllText($ConfigPath, $Utf8NoBom)
$desktopMatch = [regex]::Match($content, '(?ms)^\[desktop\]\s*\r?\n(?<body>.*?)(?=^\[|\z)')
if (-not $desktopMatch.Success) {
  $content = $content.TrimEnd() + "`r`n`r`n[desktop]`r`n"
  $desktopMatch = [regex]::Match($content, '(?ms)^\[desktop\]\s*\r?\n(?<body>.*?)(?=^\[|\z)')
}
$body = $desktopMatch.Groups['body'].Value
$settings = [ordered]@{
  appearanceTheme = 'appearanceTheme = "light"'
  appearanceLightCodeThemeId = 'appearanceLightCodeThemeId = "codex"'
  appearanceLightChromeTheme = "appearanceLightChromeTheme = { accent = `"$($theme.palette.primary)`", contrast = 64, fonts = { code = `"Cascadia Code`", ui = `"Microsoft YaHei UI`" }, ink = `"$($theme.palette.ink)`", opaqueWindows = true, semanticColors = { diffAdded = `"$($theme.palette.accent)`", diffRemoved = `"$($theme.palette.danger)`", skill = `"$($theme.palette.secondary)`" }, surface = `"$($theme.palette.background)`" }"
}
foreach ($key in $settings.Keys) {
  $pattern = "(?m)^$([regex]::Escape($key))\s*=.*$"
  if ([regex]::IsMatch($body, $pattern)) { $body = [regex]::Replace($body, $pattern, $settings[$key]) }
  else { $body = $body.TrimEnd() + "`r`n" + $settings[$key] + "`r`n" }
}
$content = $content.Substring(0, $desktopMatch.Groups['body'].Index) + $body + $content.Substring($desktopMatch.Groups['body'].Index + $desktopMatch.Groups['body'].Length)
[System.IO.File]::WriteAllText($ConfigPath, $content, $Utf8NoBom)

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
    $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`" -ThemePath `"$ThemePath`" -Port $Port"
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

Write-Host "Installed '$($theme.displayName)'. Use the new desktop shortcut to launch it."
