param(
  [switch]$RemoveFiles
)

$ErrorActionPreference = "Stop"

$schemeKey = "HKCU:\Software\Classes\laf-runner"
if (Test-Path -LiteralPath $schemeKey) {
  Remove-Item -LiteralPath $schemeKey -Recurse -Force
  Write-Host "Removed laf-runner:// URL handler"
}

$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
if (Test-Path -LiteralPath $runKey) {
  Remove-ItemProperty -Path $runKey -Name "LAF Office Runner" -ErrorAction SilentlyContinue
  Write-Host "Removed LAF Runner login startup"
}

if ($RemoveFiles) {
  $installDir = Join-Path $env:LOCALAPPDATA "LAF-Office\Runner"
  if (Test-Path -LiteralPath $installDir) {
    Remove-Item -LiteralPath $installDir -Recurse -Force
    Write-Host "Removed $installDir"
  }
}
