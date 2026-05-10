param(
  [switch]$RemoveFiles
)

$ErrorActionPreference = "Stop"

$schemeKey = "HKCU:\Software\Classes\laf-runner"
if (Test-Path -LiteralPath $schemeKey) {
  Remove-Item -LiteralPath $schemeKey -Recurse -Force
  Write-Host "Removed laf-runner:// URL handler"
}

if ($RemoveFiles) {
  $installDir = Join-Path $env:LOCALAPPDATA "LAF-Office\Runner"
  if (Test-Path -LiteralPath $installDir) {
    Remove-Item -LiteralPath $installDir -Recurse -Force
    Write-Host "Removed $installDir"
  }
}
