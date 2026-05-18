# LAF-Office

<p align="center">
  <img src="assets/hero.png" alt="LAF-Office onboarding - Your AI team, visible and working." width="720" />
</p>

[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2?logo=discord&logoColor=white)](https://discord.gg/gjSySC3PzV)
[![License: MIT](https://img.shields.io/badge/License-MIT-A87B4F)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.25+-00ADD8?logo=go&logoColor=white)](go.mod)

**한국어** | [English](#english)

## 한국어

### 작은 팀을 위한 로컬 우선 AI 워크스페이스

LAF-Office는 스타트업 팀이 AI 에이전트와 함께 제품 기획, 작업 분해,
구현, 리뷰, 팀 메모리를 한 공간에서 운영할 수 있게 만드는
local-first 워크스페이스입니다.

브라우저 UI는 프로젝트, 태스크, 에이전트 활동, 위키 메모리, 실행 결과를
보여줍니다. 실제 코드 실행은 로컬 또는 연결된 러너가 맡기 때문에, 팀은
작업이 어디서 실행되는지 보면서 안전하게 운영할 수 있습니다.

### 핵심 기능

- **프로젝트 보드**: 프로젝트별 태스크, 담당자, 상태, 리뷰 흐름을 관리합니다.
- **AI 팀 런타임**: CEO, Frontend Engineer, Backend Engineer, Reviewer가 기본 팀으로 동작합니다.
- **로컬 실행**: Codex CLI, Claude Code, OpenCode 같은 로컬 CLI 런타임을 사용할 수 있습니다.
- **LAF Bridge / Runner**: 호스팅된 웹 앱은 작업을 큐에 넣고, 연결된 로컬 러너가 파일시스템, git, GitHub, CLI 실행을 담당합니다.
- **Markdown Wiki**: 팀 위키와 에이전트별 노트북이 로컬 markdown/git 기반으로 저장됩니다.
- **가시적인 작업 흐름**: 에이전트 응답, 태스크, PR 영수증, 위키 업데이트가 UI와 파일에 남습니다.

### 빠른 시작

필수 조건:

- Go 1.25 이상
- Node/npm
- 에이전트 실행을 원하면 Codex CLI, Claude Code, 또는 OpenCode 중 하나

로컬 워크스페이스 실행:

```bash
npx laf-office
```

브라우저가 자동으로 열리고 기본 포트는 `http://localhost:7891`입니다.

전역 설치를 선호한다면:

```bash
npm install -g laf-office
laf-office
```

소스에서 직접 실행:

```bash
git clone https://github.com/LAF-labs/LAF-Agents-Office.git
cd LAF-Agents-Office
go run ./cmd/laf-office --provider codex --web-port 7891
```

### 호스팅과 LAF Bridge

LAF-Office는 로컬 워크스페이스로 바로 사용할 수 있고, hosted control plane
구조도 지원하도록 설계되어 있습니다.

중요한 경계:

- 웹 브라우저와 호스팅 API는 사용자의 로컬 Codex/Claude CLI를 직접 실행하지 않습니다.
- 호스팅된 워크스페이스에서 로컬 코드 작업을 실행하려면 LAF Bridge 또는 `laf-runner`가 연결되어야 합니다.
- Bridge가 없어도 프로젝트 관리, 태스크 기록, 위키, 리뷰 큐는 사용할 수 있습니다.
- Bridge가 연결되면 러너가 작업을 lease하고 로컬 파일시스템, git, GitHub CLI, 에이전트 CLI를 사용해 실행합니다.

러너만 설치:

```bash
curl -fsSL https://raw.githubusercontent.com/LAF-labs/LAF-Agents-Office/main/scripts/install.sh | LAF_OFFICE_INSTALL_BINARY=laf-runner sh
```

호스팅 UI의 **Settings -> LAF Bridge**에서 setup command를 만든 뒤, 실행할
Mac/Linux 머신에서 명령을 실행합니다.

```bash
laf-runner pair --api-url https://<your-hosted-app>/api --code <setup-code> --background
```

자세한 경계와 배포 흐름은
[HOSTED-PRODUCT-BOUNDARY.md](docs/specs/HOSTED-PRODUCT-BOUNDARY.md)와
[HOSTED-DEPLOYMENT-RUNBOOK.md](docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md)를 참고하세요.

### 개발 및 테스트

프론트엔드 의존성 설치:

```bash
cd web
npm install
cd ..
```

백엔드/브로커 테스트:

```bash
go test ./...
```

Hosted API 테스트:

```bash
node --test api/hosted-api.test.js
```

프론트엔드 테스트:

```bash
cd web
npm run typecheck
npm test
npm run build
```

로컬 확인:

```bash
go run ./cmd/laf-office --no-open --provider codex --web-port 7891
curl -I http://localhost:7891
curl -fsS http://localhost:7891/api/runner/status
```

참고: 현재 전체 `web npm run check`는 기존 lint backlog 때문에 실패할 수
있습니다. PR 리뷰 전에는 변경 파일 중심의 lint와 함께 `typecheck`,
`npm test`, `npm run build`, `go test ./...`를 우선 기준으로 사용하세요.

### 주요 명령

```bash
laf-office init          # 첫 설정
laf-office --no-open     # 브라우저 자동 실행 없이 시작
laf-office --provider codex
laf-office --provider claude-code
laf-office --collab      # 모든 에이전트가 같은 채널을 보는 협업 모드
laf-office shred         # 로컬 워크스페이스 상태 초기화
```

### 문서

- [ARCHITECTURE.md](ARCHITECTURE.md): 로컬 런타임 구조
- [AGENTS.md](AGENTS.md): 에이전트 운영 규칙
- [FORKING.md](FORKING.md): 포크/브랜딩 변경 가이드
- [PROJECT-TASK-TRACKING-MVP.md](docs/specs/PROJECT-TASK-TRACKING-MVP.md): 프로젝트 태스크 보드
- [HOSTED-RUNNER-PROTOCOL.md](docs/specs/HOSTED-RUNNER-PROTOCOL.md): hosted runner 프로토콜
- [WIKI-SCHEMA.md](docs/specs/WIKI-SCHEMA.md): markdown wiki 계약

### 상태

LAF-Office는 pre-1.0 프로젝트입니다. `main`은 빠르게 움직입니다. 제품에
포크하거나 배포하려면 release tag를 기준으로 고정하는 것을 권장합니다.

라이선스: MIT

---

## English

### A local-first AI workspace for small startup teams

LAF-Office is a local-first workspace for planning product work with AI agents,
breaking it into tasks, executing implementation lanes, reviewing results, and
keeping durable team memory in markdown.

The browser UI shows projects, tasks, agent activity, wiki memory, and delivery
receipts. Execution happens in a local runtime or a connected runner, so teams
can see what is running, where it runs, and what it changed.

### Highlights

- **Project task boards**: Track project-scoped tasks, owners, status, review, and delivery.
- **AI team runtime**: CEO, Frontend Engineer, Backend Engineer, and Reviewer are the default team.
- **Local execution**: Use Codex CLI, Claude Code, or OpenCode as local agent runtimes.
- **LAF Bridge / Runner**: Hosted web apps queue work; connected runners own filesystem, git, GitHub, and CLI execution.
- **Markdown wiki**: Shared team wiki plus per-agent notebooks, backed by local markdown/git.
- **Visible workflow**: Agent replies, task state, PR receipts, and wiki updates remain inspectable.

### Quick Start

Prerequisites:

- Go 1.25+
- Node/npm
- One supported agent CLI if you want execution: Codex CLI, Claude Code, or OpenCode

Run the local workspace:

```bash
npx laf-office
```

The browser opens automatically. The default UI URL is `http://localhost:7891`.

Prefer a global install?

```bash
npm install -g laf-office
laf-office
```

Run from source:

```bash
git clone https://github.com/LAF-labs/LAF-Agents-Office.git
cd LAF-Agents-Office
go run ./cmd/laf-office --provider codex --web-port 7891
```

### Hosted Mode and LAF Bridge

LAF-Office works as a local workspace today and is designed around a hosted
control-plane boundary.

Important boundary:

- The browser and hosted API do not directly run a user's local Codex/Claude CLI.
- Hosted local-code execution requires a paired LAF Bridge or `laf-runner`.
- Without a bridge, project management, task records, wiki, and review queues still work.
- With a bridge, the runner leases jobs and executes them using the local filesystem, git, GitHub CLI, and agent CLI.

Install only the runner:

```bash
curl -fsSL https://raw.githubusercontent.com/LAF-labs/LAF-Agents-Office/main/scripts/install.sh | LAF_OFFICE_INSTALL_BINARY=laf-runner sh
```

In the hosted UI, open **Settings -> LAF Bridge**, create a setup command, and
run it on the Mac/Linux machine that should execute work.

```bash
laf-runner pair --api-url https://<your-hosted-app>/api --code <setup-code> --background
```

For details, see
[HOSTED-PRODUCT-BOUNDARY.md](docs/specs/HOSTED-PRODUCT-BOUNDARY.md) and
[HOSTED-DEPLOYMENT-RUNBOOK.md](docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md).

### Development and Tests

Install frontend dependencies:

```bash
cd web
npm install
cd ..
```

Backend and broker tests:

```bash
go test ./...
```

Hosted API tests:

```bash
node --test api/hosted-api.test.js
```

Frontend checks:

```bash
cd web
npm run typecheck
npm test
npm run build
```

Local smoke test:

```bash
go run ./cmd/laf-office --no-open --provider codex --web-port 7891
curl -I http://localhost:7891
curl -fsS http://localhost:7891/api/runner/status
```

Note: the full `web npm run check` can fail on existing lint backlog. For PR
review, use targeted lint on changed files plus `typecheck`, `npm test`,
`npm run build`, and `go test ./...`.

### Common Commands

```bash
laf-office init          # First-time setup
laf-office --no-open     # Start without opening a browser
laf-office --provider codex
laf-office --provider claude-code
laf-office --collab      # Shared-channel collaboration mode
laf-office shred         # Reset local workspace state
```

### Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md): local runtime architecture
- [AGENTS.md](AGENTS.md): agent operating rules
- [FORKING.md](FORKING.md): forking and rebranding guide
- [PROJECT-TASK-TRACKING-MVP.md](docs/specs/PROJECT-TASK-TRACKING-MVP.md): project task board
- [HOSTED-RUNNER-PROTOCOL.md](docs/specs/HOSTED-RUNNER-PROTOCOL.md): hosted runner protocol
- [WIKI-SCHEMA.md](docs/specs/WIKI-SCHEMA.md): markdown wiki contract

### Status

LAF-Office is pre-1.0. `main` moves quickly. If you fork or deploy it, pin to a
release tag rather than tracking `main` directly.

License: MIT
