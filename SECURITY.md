# Security Policy

Startup Office handles workspace data, team permissions, wiki memory, AI agent runs, and hosted worker actions, so security reports are welcome.

## Supported Versions

Security fixes target the `main` branch. This project does not currently publish versioned long-term support releases.

## Reporting a Vulnerability

Please report suspected vulnerabilities through GitHub private vulnerability reporting or by contacting the repository maintainers directly.

Do not open a public issue for vulnerabilities that could expose:

- authentication or authorization bypasses
- tenant isolation failures
- secret handling problems
- prompt, tool, or agent injection paths
- data export, deletion, or audit-log integrity bugs
- dependency vulnerabilities with an available exploit path

Include the affected commit or branch, reproduction steps, expected impact, and any safe proof of concept. We will acknowledge valid reports as soon as practical and coordinate a fix before public disclosure.
