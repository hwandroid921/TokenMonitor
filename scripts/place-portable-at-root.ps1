param(
  [string]$PackageVersion = "",
  [string]$OutputDir = "dist-portable"
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$packageJsonPath = Join-Path $root "package.json"
if (-not $PackageVersion) {
  $PackageVersion = (Get-Content -Raw -LiteralPath $packageJsonPath | ConvertFrom-Json).version
}

$tempOutput = Join-Path $root $OutputDir
$portableName = "TokenMonitor-$PackageVersion-x64.exe"
$sourcePath = Join-Path $tempOutput $portableName
$targetPath = Join-Path $root $portableName

$resolvedRoot = [System.IO.Path]::GetFullPath($root)
$resolvedTempOutput = [System.IO.Path]::GetFullPath($tempOutput)
$resolvedSourcePath = [System.IO.Path]::GetFullPath($sourcePath)
$resolvedTargetPath = [System.IO.Path]::GetFullPath($targetPath)

function Test-PathWithin([string]$ChildPath, [string]$ParentPath) {
  $parentWithSeparator = $ParentPath.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  return $ChildPath.Equals($ParentPath, [System.StringComparison]::OrdinalIgnoreCase) -or
    $ChildPath.StartsWith($parentWithSeparator, [System.StringComparison]::OrdinalIgnoreCase)
}

if (-not (Test-PathWithin $resolvedTempOutput $resolvedRoot)) {
  throw "Portable output path is outside the project root."
}

if (-not (Test-PathWithin $resolvedSourcePath $resolvedTempOutput)) {
  throw "Portable source path is outside the temporary output folder."
}

if (-not (Test-PathWithin $resolvedTargetPath $resolvedRoot)) {
  throw "Portable target path is outside the project root."
}

if (-not (Test-Path -LiteralPath $resolvedSourcePath -PathType Leaf)) {
  throw "Portable executable was not generated: $resolvedSourcePath"
}

Copy-Item -LiteralPath $resolvedSourcePath -Destination $resolvedTargetPath -Force

Get-ChildItem -LiteralPath $resolvedRoot -Filter "TokenMonitor-*-x64.exe" -File |
  Where-Object { $_.FullName -ne $resolvedTargetPath } |
  ForEach-Object {
    $candidatePath = [System.IO.Path]::GetFullPath($_.FullName)
    if (-not (Test-PathWithin $candidatePath $resolvedRoot)) {
      throw "Portable cleanup candidate is outside the project root."
    }
    Remove-Item -LiteralPath $candidatePath -Force
  }

if (Test-Path -LiteralPath $resolvedTempOutput -PathType Container) {
  Remove-Item -LiteralPath $resolvedTempOutput -Recurse -Force
}

Write-Host "Portable executable placed at $resolvedTargetPath"
