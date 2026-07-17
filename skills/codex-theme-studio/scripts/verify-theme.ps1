[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ThemePath,
  [int]$Port = 9335,
  [string]$Screenshot,
  [ValidateSet('Home', 'Chat', 'Current')][string]$View = 'Home'
)
$ErrorActionPreference = 'Stop'
$node = (Get-Command node -ErrorAction Stop).Source
$injector = Join-Path $PSScriptRoot 'theme-injector.mjs'
$arguments = @($injector, '--verify', '--view', $View.ToLowerInvariant(), '--port', "$Port", '--theme', (Resolve-Path -LiteralPath $ThemePath).Path)
if ($Screenshot) { $arguments += @('--screenshot', $Screenshot) }
& $node @arguments
exit $LASTEXITCODE
