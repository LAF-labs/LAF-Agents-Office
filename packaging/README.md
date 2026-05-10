# Runner Packaging

The hosted product needs a local runner installer because the browser cannot
launch Codex CLI or Claude Code CLI directly. The installer puts `laf-runner`
on the user machine and registers the `laf-runner://` URL handler used by
Settings -> Runner -> Connect this computer.

## Windows

Build a development zip on Windows:

```powershell
.\packaging\windows\build-runner-dev-package.ps1
```

The zip contains:

- `laf-runner.exe`
- `laf-runner-installer.exe`
- fallback PowerShell install/uninstall helpers
- `README-FIRST.txt`

For a non-developer first run, the user opens the zip and double-clicks
`laf-runner-installer.exe`. The installer copies `laf-runner.exe` to the user's
local app data directory and registers the `laf-runner://` link handler under
HKCU, so admin rights are not required. It also registers a per-user login
startup entry that runs `laf-runner connect`; before pairing, that command exits
without doing work, and after pairing it keeps the machine available for queued
runner jobs.

Production releases should sign `laf-runner-installer.exe` and the final zip or
wrap the same install steps in MSI when certificate and installer infrastructure
are available.

Build an unsigned per-user MSI with WiX:

```powershell
.\packaging\windows\build-runner-msi.ps1
```

WiX 7 requires explicit OSMF EULA acceptance before `wix build` can run. Accept
it yourself once with:

```powershell
& "$env:USERPROFILE\.dotnet\tools\wix.exe" eula accept wix7
```

or pass `-AcceptWix7Eula` to the build script after you have confirmed the
terms. The MSI installs to `%LOCALAPPDATA%\LAF-Office\Runner`, registers the
same per-user `laf-runner://` URL handler as the development installer, and
starts the runner at user login.

Windows Installer versions use three numeric fields, so four-part repo versions
are encoded into the third MSI field. For example, repo version `0.0.7.1`
becomes MSI ProductVersion `0.0.7001`.

The browser URL handler only trusts official `laf-office.team` origins,
loopback development origins, the already configured runner API origin, or
hosts listed in `LAF_OFFICE_RUNNER_TRUSTED_API_HOSTS`. Self-hosted deployments
should set that environment variable or use the manual `laf-runner pair`
fallback for the first connection.

## macOS

Build an unsigned PKG on macOS:

```sh
packaging/macos/build-runner-pkg.sh
```

To sign the package:

```sh
MACOS_INSTALLER_SIGN_IDENTITY="Developer ID Installer: Example, Inc. (TEAMID)" \
  packaging/macos/build-runner-pkg.sh
```

The package installs `/usr/local/bin/laf-runner` and registers a small
`/Applications/LAF Runner Link.app` URL handler for `laf-runner://` links.

## Manual Protocol Helpers

The protocol-only helpers remain available for development and emergency
support:

- `packaging/windows/install-runner-protocol.ps1`
- `packaging/macos/install-runner-protocol.sh`
