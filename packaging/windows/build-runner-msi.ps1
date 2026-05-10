param(
  [string]$OutDir = "dist",
  [string]$Version = "",
  [ValidateSet("x64", "arm64")]
  [string]$Architecture = "x64",
  [switch]$AcceptWix7Eula
)

$ErrorActionPreference = "Stop"

function Resolve-RepoVersion {
  param([string]$RepoRoot)

  $versionFile = Join-Path $RepoRoot "VERSION"
  if (!(Test-Path -LiteralPath $versionFile)) {
    return "0.0.0"
  }

  $raw = (Get-Content -LiteralPath $versionFile -TotalCount 1).Trim()
  $pointedFile = Join-Path $RepoRoot $raw
  if (Test-Path -LiteralPath $pointedFile) {
    return (Get-Content -LiteralPath $pointedFile -TotalCount 1).Trim()
  }
  return $raw
}

function Convert-ToMsiVersion {
  param([string]$RawVersion)

  $numbers = @($RawVersion -split "[^0-9]+" | Where-Object { $_ -ne "" })
  if ($numbers.Count -eq 0) {
    throw "Version '$RawVersion' does not contain a numeric MSI version."
  }

  while ($numbers.Count -lt 3) {
    $numbers += "0"
  }

  $major = [int]$numbers[0]
  $minor = [int]$numbers[1]
  $patch = [int]$numbers[2]
  if ($numbers.Count -gt 3) {
    $revision = [int]$numbers[3]
    if ($revision -gt 999) {
      throw "MSI revision '$revision' is too large; use 0-999 so it can be encoded into the third ProductVersion field."
    }
    $patch = ($patch * 1000) + $revision
  }
  if ($major -gt 255 -or $minor -gt 65535 -or $patch -gt 65535) {
    throw "Version '$RawVersion' cannot be represented as a Windows Installer ProductVersion."
  }

  return "$major.$minor.$patch"
}

function Resolve-WixPath {
  $command = Get-Command "wix.exe" -ErrorAction SilentlyContinue
  if ($null -ne $command) {
    return $command.Source
  }

  $userTool = Join-Path $env:USERPROFILE ".dotnet\tools\wix.exe"
  if (Test-Path -LiteralPath $userTool) {
    return $userTool
  }

  throw "wix.exe was not found. Install WiX with: dotnet tool install --global wix"
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..\..")

if ([string]::IsNullOrWhiteSpace($Version)) {
  $Version = Resolve-RepoVersion -RepoRoot $repoRoot
}
$msiVersion = Convert-ToMsiVersion -RawVersion $Version

$resolvedOutDir = if ([System.IO.Path]::IsPathRooted($OutDir)) {
  $OutDir
} else {
  Join-Path $repoRoot $OutDir
}

$goArch = @{
  x64 = "amd64"
  arm64 = "arm64"
}[$Architecture]

$buildDir = Join-Path $resolvedOutDir "msi-$Architecture"
$runnerExe = Join-Path $buildDir "laf-runner.exe"
$msiPath = Join-Path $resolvedOutDir "laf-runner-$msiVersion-windows-$Architecture.msi"
$wxsPath = Join-Path $scriptDir "laf-runner.wxs"
$wixPath = Resolve-WixPath

New-Item -ItemType Directory -Path $buildDir -Force | Out-Null

Push-Location $repoRoot
try {
  $previousGoos = $env:GOOS
  $previousGoarch = $env:GOARCH
  $previousCgo = $env:CGO_ENABLED
  $env:GOOS = "windows"
  $env:GOARCH = $goArch
  $env:CGO_ENABLED = "0"
  go build -o $runnerExe ./cmd/laf-runner
} finally {
  $env:GOOS = $previousGoos
  $env:GOARCH = $previousGoarch
  $env:CGO_ENABLED = $previousCgo
  Pop-Location
}

if (Test-Path -LiteralPath $msiPath) {
  Remove-Item -LiteralPath $msiPath -Force
}

$wixArgs = @("build")
if ($AcceptWix7Eula) {
  $wixArgs += @("-acceptEula", "wix7")
}
$wixArgs += @(
  $wxsPath,
  "-arch", $Architecture,
  "-d", "RunnerExe=$runnerExe",
  "-d", "ProductVersion=$msiVersion",
  "-out", $msiPath
)

& $wixPath @wixArgs
if ($LASTEXITCODE -ne 0) {
  throw "WiX failed with exit code $LASTEXITCODE. If this is WIX7015, accept the WiX 7 EULA yourself or rerun this script with -AcceptWix7Eula after confirming the OSMF terms."
}

Write-Host "Created $msiPath"
