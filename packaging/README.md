# Packaging

The supported hosted execution entrypoint is the npm-based LAF Bridge command
shown in the hosted web app:

```sh
npx laf-bridge pair
```

Create the setup code in Settings -> LAF Bridge and paste it when the command
prompts for it.

The generic release install script is maintained for source checkouts, release
smoke tests, and tarball fallback installs. It still supports native
`laf-office` and `laf-bridge` binaries, but hosted onboarding should point only
to the Bridge pairing command above:

```sh
LAF_OFFICE_INSTALL_BINARY=laf-bridge sh scripts/install.sh
```

Native desktop installers and URL handlers are outside the current supported
hosted onboarding path.
