# LAF Bridge Packaging

Native LAF Bridge installers are paused. The supported hosted onboarding path is
command-only on macOS and Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/LAF-labs/LAF-Agents-Office/main/scripts/install.sh | LAF_OFFICE_INSTALL_BINARY=laf-runner sh
```

For source checkouts or release tarballs, run the install script directly:

```sh
LAF_OFFICE_INSTALL_BINARY=laf-runner sh scripts/install.sh
```

Then create a setup command in Settings -> LAF Bridge and connect the machine:

```sh
laf-runner pair --api-url https://<your-hosted-app>/api --code <setup-code> --background
```

Windows support, PKG/MSI installers, and URL-handler pairing are intentionally
out of the supported path until the command-line runner flow is stable.

The platform-specific scripts in this directory are retained as historical
implementation experiments and should not be presented in product onboarding.
