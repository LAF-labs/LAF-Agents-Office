param(
  [string]$RunnerPath = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RunnerPath)) {
  $command = Get-Command "laf-runner.exe" -ErrorAction SilentlyContinue
  if ($null -eq $command) {
    throw "laf-runner.exe was not found on PATH. Pass -RunnerPath C:\path\to\laf-runner.exe."
  }
  $RunnerPath = $command.Source
}

$resolvedRunner = (Resolve-Path -LiteralPath $RunnerPath).Path
$schemeKey = "HKCU:\Software\Classes\laf-runner"
$commandKey = Join-Path $schemeKey "shell\open\command"

New-Item -Path $commandKey -Force | Out-Null
Set-Item -Path $schemeKey -Value "URL:LAF Runner"
Set-ItemProperty -Path $schemeKey -Name "URL Protocol" -Value ""
Set-Item -Path $commandKey -Value "`"$resolvedRunner`" pair-url `"%1`""

Write-Host "Registered laf-runner:// URL handler for $resolvedRunner"
