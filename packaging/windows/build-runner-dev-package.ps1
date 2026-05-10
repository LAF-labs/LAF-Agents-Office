param(
  [string]$OutDir = "dist",
  [string]$Version = ""
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..\..")

function Resolve-RepoVersion {
  param([string]$RepoRoot)

  $versionFile = Join-Path $RepoRoot "VERSION"
  if (!(Test-Path -LiteralPath $versionFile)) {
    return "0.0.0-dev"
  }

  $raw = (Get-Content -LiteralPath $versionFile -TotalCount 1).Trim()
  $pointedFile = Join-Path $RepoRoot $raw
  if (Test-Path -LiteralPath $pointedFile) {
    return (Get-Content -LiteralPath $pointedFile -TotalCount 1).Trim()
  }
  return $raw
}

if ([string]::IsNullOrWhiteSpace($Version)) {
  $Version = Resolve-RepoVersion -RepoRoot $repoRoot
}

$resolvedOutDir = if ([System.IO.Path]::IsPathRooted($OutDir)) {
  $OutDir
} else {
  Join-Path $repoRoot $OutDir
}

$packageName = "laf-runner-windows-$Version"
$packageDir = Join-Path $resolvedOutDir $packageName
$zipPath = Join-Path $resolvedOutDir "$packageName.zip"

New-Item -ItemType Directory -Path $resolvedOutDir -Force | Out-Null
if (Test-Path -LiteralPath $packageDir) {
  Remove-Item -LiteralPath $packageDir -Recurse -Force
}
New-Item -ItemType Directory -Path $packageDir -Force | Out-Null

Push-Location $repoRoot
try {
  go build -o (Join-Path $packageDir "laf-runner.exe") ./cmd/laf-runner
  go build -ldflags "-H=windowsgui" -o (Join-Path $packageDir "laf-runner-installer.exe") ./cmd/laf-runner-installer
} finally {
  Pop-Location
}

Copy-Item -LiteralPath (Join-Path $scriptDir "install-runner-protocol.ps1") -Destination $packageDir
Copy-Item -LiteralPath (Join-Path $scriptDir "install-runner.ps1") -Destination $packageDir
Copy-Item -LiteralPath (Join-Path $scriptDir "uninstall-runner.ps1") -Destination $packageDir

@"
LAF Runner for Windows

1. Double-click laf-runner-installer.exe.
2. Return to the hosted LAF-Office browser tab.
3. Open Settings -> Runner and click Connect this computer.

The installer copies laf-runner.exe to your user profile and registers the laf-runner:// link handler. No admin rights are required.
"@ | Set-Content -LiteralPath (Join-Path $packageDir "README-FIRST.txt") -Encoding UTF8

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $packageDir "*") -DestinationPath $zipPath -Force

Write-Host "Created $zipPath"
