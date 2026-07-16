[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$InputPng,
  [Parameter(Mandatory = $true)][string]$OutputIco
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$InputPng = (Resolve-Path -LiteralPath $InputPng).Path
$outputDirectory = Split-Path -Parent $OutputIco
if ($outputDirectory) { New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null }
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$source = [System.Drawing.Image]::FromFile($InputPng)
try {
  if ($source.Width -ne $source.Height -or $source.Width -lt 256) { throw 'Shortcut icon PNG must be square and at least 256x256.' }
  $images = @()
  foreach ($size in $sizes) {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.DrawImage($source, 0, 0, $size, $size)
      } finally { $graphics.Dispose() }
      $stream = New-Object System.IO.MemoryStream
      $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
      $images += ,$stream.ToArray()
      $stream.Dispose()
    } finally { $bitmap.Dispose() }
  }

  $file = [System.IO.File]::Open($OutputIco, [System.IO.FileMode]::Create)
  $writer = New-Object System.IO.BinaryWriter($file)
  try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$images.Count)
    $offset = 6 + (16 * $images.Count)
    for ($index = 0; $index -lt $images.Count; $index++) {
      $size = $sizes[$index]
      $writer.Write([byte]$(if ($size -eq 256) { 0 } else { $size }))
      $writer.Write([byte]$(if ($size -eq 256) { 0 } else { $size }))
      $writer.Write([byte]0); $writer.Write([byte]0)
      $writer.Write([uint16]1); $writer.Write([uint16]32)
      $writer.Write([uint32]$images[$index].Length); $writer.Write([uint32]$offset)
      $offset += $images[$index].Length
    }
    foreach ($bytes in $images) { $writer.Write($bytes) }
  } finally { $writer.Dispose(); $file.Dispose() }
} finally { $source.Dispose() }

$icon = Get-Item -LiteralPath $OutputIco
if ($icon.Length -lt 1024) { throw "Generated icon is unexpectedly small: $($icon.Length) bytes" }
Write-Host "Built multi-size Windows icon: $OutputIco"
