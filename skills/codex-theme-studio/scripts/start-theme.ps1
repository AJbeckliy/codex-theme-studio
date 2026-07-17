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
  foreach ($endpoint in @('127.0.0.1', '[::1]', 'localhost')) {
    try {
      $targets = Invoke-RestMethod "http://${endpoint}:$CandidatePort/json/list" -TimeoutSec 1
      if ($targets | Where-Object { $_.type -eq 'page' -and $_.url -like 'app://*' }) { return $true }
    } catch {}
  }
  return $false
}

function Get-CodexMainProcesses {
  return @(Get-Process ChatGPT -ErrorAction SilentlyContinue | Where-Object {
    $_.MainWindowHandle -ne 0 -and $_.Path -like '*\WindowsApps\OpenAI.Codex_*'
  })
}

function Test-SamePath([string]$Left, [string]$Right) {
  if (-not $Left -or -not $Right) { return $false }
  return [System.IO.Path]::GetFullPath($Left).TrimEnd('\') -eq [System.IO.Path]::GetFullPath($Right).TrimEnd('\')
}

function Test-ThemeInjectorState($SavedState) {
  if (-not $SavedState -or -not $SavedState.injectorPid) { return $false }
  $process = Get-Process -Id ([int]$SavedState.injectorPid) -ErrorAction SilentlyContinue
  if (-not $process -or $process.ProcessName -ne 'node') { return $false }
  $commandLine = (Get-CimInstance Win32_Process -Filter "ProcessId=$($process.Id)" -ErrorAction SilentlyContinue).CommandLine
  if ($commandLine -notlike '*theme-injector.mjs*--watch*') { return $false }
  if ($SavedState.injectorStartedAt) {
    $savedStart = [datetime]::Parse($SavedState.injectorStartedAt).ToUniversalTime()
    if ([math]::Abs(($process.StartTime.ToUniversalTime() - $savedStart).TotalSeconds) -gt 2) { return $false }
  }
  return $true
}

function Stop-ThemeInjectorFromState($SavedState) {
  if (-not (Test-ThemeInjectorState $SavedState)) { return $false }
  Stop-Process -Id ([int]$SavedState.injectorPid) -Force
  return $true
}

function Stop-CodexMainProcesses($Processes) {
  foreach ($process in $Processes) { [void]$process.CloseMainWindow() }
  Start-Sleep -Seconds 2
  foreach ($process in $Processes) {
    if (Get-Process -Id $process.Id -ErrorAction SilentlyContinue) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
  }
  Start-Sleep -Milliseconds 600
}

function Start-ThemeInjector([string]$TargetTheme, [int]$TargetPort) {
  $injectorArgs = @("`"$Injector`"", '--watch', '--port', "$TargetPort", '--theme', "`"$TargetTheme`"")
  return Start-Process -FilePath $node -ArgumentList $injectorArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput $StdoutPath -RedirectStandardError $StderrPath
}

$oldState = $null
if (Test-Path -LiteralPath $StatePath) {
  try { $oldState = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json } catch {}
}
$debugReady = Test-CodexDebugPort $Port
$profileOwnsPort = $ProfilePath -and $oldState -and ([int]$oldState.port -eq $Port) -and
  (Test-SamePath $oldState.profilePath $ProfilePath) -and (Test-ThemeInjectorState $oldState)
if ($debugReady -and $ProfilePath -and -not $profileOwnsPort) {
  throw "Port $Port belongs to an unknown or non-isolated Codex session. Use a free port; the default window will not be themed."
}
$mainProcesses = @(Get-CodexMainProcesses)
if (-not $debugReady -and -not $ProfilePath -and $mainProcesses.Count -gt 0) {
  if (-not $RestartExisting) {
    throw "Codex is running without remote debugging on port $Port. Save current work, close Codex, or rerun with -RestartExisting."
  }
}

$daemon = $null
$oldStopped = $false
$restartPerformed = $false
try {
  if (-not $debugReady -and -not $ProfilePath -and $mainProcesses.Count -gt 0) {
    Stop-CodexMainProcesses $mainProcesses
    $restartPerformed = $true
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

  if ($oldState -and $oldState.injectorPid) {
    $oldStopped = Stop-ThemeInjectorFromState $oldState
  }

  if ($ForegroundInjector) {
    & $node $Injector --watch --port $Port --theme $ThemePath
    exit $LASTEXITCODE
  }

  $daemon = Start-ThemeInjector $ThemePath $Port
  $verified = $false
  for ($attempt = 0; $attempt -lt 45; $attempt++) {
    Start-Sleep -Milliseconds 700
    & $node $Injector --verify --view current --port $Port --theme $ThemePath *> $null
    if ($LASTEXITCODE -eq 0) { $verified = $true; break }
  }
  if (-not $verified) { throw "Theme launched but verification failed. See $StderrPath" }

  $state = @{
    port = $Port; injectorPid = $daemon.Id; startedAt = (Get-Date).ToString('o')
    injectorStartedAt = $daemon.StartTime.ToUniversalTime().ToString('o')
    skillRoot = $SkillRoot; profilePath = $ProfilePath; themePath = $ThemePath
    themeId = $theme.id; themeVersion = $theme.version
  } | ConvertTo-Json
  [System.IO.File]::WriteAllText($StatePath, $state, $Utf8NoBom)
} catch {
  $failure = $_
  if ($daemon) { Stop-Process -Id $daemon.Id -Force -ErrorAction SilentlyContinue }
  if ($restartPerformed) {
    try {
      $rollbackProcesses = @(Get-CodexMainProcesses)
      if ($rollbackProcesses.Count -gt 0) { Stop-CodexMainProcesses $rollbackProcesses }
      $rollbackPackage = Get-AppxPackage OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1
      if ($rollbackPackage) {
        [void][CodexThemeStudio.Runtime.PackagedAppLauncher]::Activate("$($rollbackPackage.PackageFamilyName)!App", "--remote-debugging-port=$Port")
        $rollbackDeadline = (Get-Date).AddSeconds(30)
        while (-not (Test-CodexDebugPort $Port) -and (Get-Date) -lt $rollbackDeadline) { Start-Sleep -Milliseconds 400 }
      }
    } catch { Write-Warning "Codex could not be restarted after the failed theme launch: $($_.Exception.Message)" }
  }
  if ($oldStopped -and $oldState -and $oldState.themePath -and (Test-Path -LiteralPath $oldState.themePath) -and $(Test-CodexDebugPort ([int]$oldState.port))) {
    $restored = Start-ThemeInjector $oldState.themePath ([int]$oldState.port)
    $oldState.injectorPid = $restored.Id
    $oldState.startedAt = (Get-Date).ToString('o')
    $oldState.injectorStartedAt = $restored.StartTime.ToUniversalTime().ToString('o')
    [System.IO.File]::WriteAllText($StatePath, ($oldState | ConvertTo-Json), $Utf8NoBom)
  } elseif ($oldStopped) {
    Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue
    try { & $node $Injector --remove --port $Port --timeout-ms 3000 *> $null } catch {}
  }
  throw $failure
}
Write-Host "Codex theme '$($theme.displayName)' is active on port $Port."
