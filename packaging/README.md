# Packaging

The supported production onboarding path is the hosted LAF-Office web app.
Users create or join a company workspace, invite teammates, and operate the AI
Startup Office entirely through the cloud product surface.

The generic release install script remains only for source checkouts, release
smoke tests, and tarball fallback installs of the `laf-office` developer
bootstrap.

```sh
sh scripts/install.sh
```

Native desktop installers and URL handlers are outside the current supported
hosted onboarding path.
