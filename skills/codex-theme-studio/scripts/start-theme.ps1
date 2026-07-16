[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ThemePath,
  [int]$Port = 9335,
  [switch]$RestartExisting,
  [string]$ProfilePath,
  [switch]$ForegroundInjector
)

$ErrorActionPreference = 'Stop'
$ThemePath = (Resolve-Path -LiteralPath $ThemePath).Path
$SkillRoot = Split-Path -Parent $PSScriptRoot
$Injector = Join-Path $PSScriptRoot 'theme-injector.mjs'
$Validator = Join-Path $PSScriptRoot 'validate-theme.mjs'
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexThemeStudio'
$StatePath = Join-Path $StateRoot 'state.json'
$StdoutPath = Join-Path $StateRoot 'injector.log'
$StderrPath = Join-Path $StateRoot 'injector-error.log'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false, $true)
New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null

$node = (Get-Command node -ErrorAction Stop).Source
$theme = Get-Content -LiteralPath (Join-Path $ThemePath 'theme.json') -Raw -Encoding UTF8 | ConvertFrom-Json
& $node $Validator --theme $ThemePath *> $null
if ($LASTEXITCODE -ne 0) { throw "Theme validation failed: $ThemePath" }

if (-not ('CodexThemeStudio.Runtime.PackagedAppLauncher' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace CodexThemeStudio.Runtime {
  [ComImport]
  [Guid("2e941141-7f97-4756-ba1d-9decde894a3d")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IApplicationActivationManager {
    [PreserveSig]
    int ActivateApplication(
      [MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
      [MarshalAs(UnmanagedType.LPWStr)] string arguments,
      int options,
      out uint processId);
  }

  [ComImport]
  [Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
  class ApplicationActivationManager {}

  public static class PackagedAppLauncher {
    public static uint Activate(string appUserModelId, string arguments) {
      var manager = (IApplicationActivationManager)new ApplicationActivationManager();
      uint processId;
      int result = manager.ActivateApplication(appUserModelId, arguments, 0, out processId);
      Marshal.ThrowExceptionForHR(result);
      return processId;
    }
  }
}
'@
}

function Test-CodexDebugPort([int]$CandidatePort) {
  try {
    $targets = Invoke-RestMethod "http://127.0.0.1:$CandidatePort/json/list" -TimeoutSec 1
    return [bool]($targets | Where-Object { $_.type -eq 'page' -and $_.url -like 'app://*' })
  } catch { return $false }
}

$debugReady = Test-CodexDebugPort $Port
$mainProcesses = @(Get-Process ChatGPT -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })
if (-not $debugReady -and -not $ProfilePath -and $mainProcesses.Count -gt 0) {
  if (-not $RestartExisting) {
    throw "Codex is already running without remote debugging on port $Port. Close Codex or rerun with -RestartExisting."
  }
  foreach ($process in $mainProcesses) { [void]$process.CloseMainWindow() }
  Start-Sleep -Seconds 2
  Get-Process ChatGPT -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Milliseconds 600
}

if (-not (Test-CodexDebugPort $Port)) {
  $package = Get-AppxPackage OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1
  if (-not $package) { throw 'The OpenAI.Codex Store package is not installed.' }
  $arguments = "--remote-debugging-port=$Port"
  if ($ProfilePath) {
    New-Item -ItemType Directory -Force -Path $ProfilePath | Out-Null
    $arguments += " --user-data-dir=`"$($ProfilePath.Replace('"', '\"'))`""
  }
  [void][CodexThemeStudio.Runtime.PackagedAppLauncher]::Activate("$($package.PackageFamilyName)!App", $arguments)
}

$deadline = (Get-Date).AddSeconds(30)
while (-not (Test-CodexDebugPort $Port)) {
  if ((Get-Date) -ge $deadline) { throw "Codex did not expose CDP on port $Port within 30 seconds." }
  Start-Sleep -Milliseconds 400
}

if (Test-Path -LiteralPath $StatePath) {
  try {
    $old = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($old.injectorPid) { Stop-Process -Id ([int]$old.injectorPid) -Force -ErrorAction SilentlyContinue }
  } catch {}
}

if ($ForegroundInjector) {
  & $node $Injector --watch --port $Port --theme $ThemePath
  exit $LASTEXITCODE
}

$injectorArgs = @("`"$Injector`"", '--watch', '--port', "$Port", '--theme', "`"$ThemePath`"")
$daemon = Start-Process -FilePath $node -ArgumentList $injectorArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput $StdoutPath -RedirectStandardError $StderrPath
$state = @{
  port = $Port; injectorPid = $daemon.Id; startedAt = (Get-Date).ToString('o')
  skillRoot = $SkillRoot; profilePath = $ProfilePath; themePath = $ThemePath
  themeId = $theme.id; themeVersion = $theme.version
} | ConvertTo-Json
[System.IO.File]::WriteAllText($StatePath, $state, $Utf8NoBom)

$verified = $false
for ($attempt = 0; $attempt -lt 45; $attempt++) {
  Start-Sleep -Milliseconds 700
  & $node $Injector --verify --port $Port --theme $ThemePath *> $null
  if ($LASTEXITCODE -eq 0) { $verified = $true; break }
}
if (-not $verified) { throw "Theme launched but verification failed. See $StderrPath" }
Write-Host "Codex theme '$($theme.displayName)' is active on port $Port."
