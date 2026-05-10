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
HKCU, so admin rights are not required.

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
terms. The MSI installs to `%LOCALAPPDATA%\LAF-Office\Runner` and registers the
same per-user `laf-runner://` URL handler as the development installer.

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
