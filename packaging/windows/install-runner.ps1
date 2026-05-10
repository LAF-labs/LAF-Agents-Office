param(
  [string]$RunnerPath = "",
  [string]$InstallDir = ""
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if ([string]::IsNullOrWhiteSpace($RunnerPath)) {
  $candidate = Join-Path $scriptDir "laf-runner.exe"
  if (Test-Path -LiteralPath $candidate) {
    $RunnerPath = $candidate
  } else {
    $command = Get-Command "laf-runner.exe" -ErrorAction SilentlyContinue
    if ($null -eq $command) {
      throw "laf-runner.exe was not found next to this script or on PATH. Pass -RunnerPath C:\path\to\laf-runner.exe."
    }
    $RunnerPath = $command.Source
  }
}

if ([string]::IsNullOrWhiteSpace($InstallDir)) {
  $InstallDir = Join-Path $env:LOCALAPPDATA "LAF-Office\Runner"
}

$resolvedRunner = (Resolve-Path -LiteralPath $RunnerPath).Path
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

$installedRunner = Join-Path $InstallDir "laf-runner.exe"
Copy-Item -LiteralPath $resolvedRunner -Destination $installedRunner -Force

& (Join-Path $scriptDir "install-runner-protocol.ps1") -RunnerPath $installedRunner

$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
New-Item -Path $runKey -Force | Out-Null
Set-ItemProperty -Path $runKey -Name "LAF Office Runner" -Value "`"$installedRunner`" connect"

Write-Host "Installed LAF Runner to $installedRunner"
Write-Host "Registered LAF Runner to start at user login"
