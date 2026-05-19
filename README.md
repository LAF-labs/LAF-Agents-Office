# LAF-Office

<p align="center">
  <img src="assets/hero.png" alt="LAF-Office onboarding - Your AI team, visible and working." width="720" />
</p>

[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2?logo=discord&logoColor=white)](https://discord.gg/gjSySC3PzV)
[![License: MIT](https://img.shields.io/badge/License-MIT-A87B4F)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.25+-00ADD8?logo=go&logoColor=white)](go.mod)

**한국어** | [English](#english)

## 한국어

### 작은 팀을 위한 웹호스팅 기반 AI 개발 워크스페이스

LAF-Office는 스타트업 팀이 AI 에이전트와 함께 제품 기획, 작업 분해,
구현, 리뷰, 팀 메모리를 한 공간에서 운영할 수 있게 만드는
웹호스팅 기반 워크스페이스입니다.

브라우저 UI는 프로젝트, 태스크, 에이전트 활동, 위키 메모리, 실행 결과를
보여줍니다. 호스팅된 웹앱은 로컬 CLI를 직접 실행하지 않고, 연결된
LAF Bridge가 파일시스템, git, GitHub, Codex/Claude CLI 실행과 결과 업로드를
맡습니다.

### 핵심 기능

- **프로젝트 보드**: 프로젝트별 태스크, 담당자, 상태, 리뷰 흐름을 관리합니다.
- **AI 팀 런타임**: CEO, Frontend Engineer, Backend Engineer, Reviewer가 기본 팀으로 동작합니다.
- **Bridge 실행**: Codex CLI, Claude Code 같은 로컬 CLI 런타임을 LAF Bridge로 연결합니다.
- **LAF Bridge**: 호스팅된 웹 앱은 작업을 큐에 넣고, 연결된 Bridge가 파일시스템, git, GitHub, CLI 실행을 담당합니다.
- **Team Memory**: 팀 위키와 에이전트별 노트북이 프로젝트 맥락과 실행 영수증을 함께 보존합니다.
- **가시적인 작업 흐름**: 에이전트 응답, 태스크, PR 영수증, 위키 업데이트가 UI와 파일에 남습니다.

### 빠른 시작

운영 사용자 흐름:

1. 배포된 LAF-Office 웹앱에서 로그인합니다.
2. 프로젝트를 만들고 **Settings -> LAF Bridge**에서 setup code를 만듭니다.
3. 작업을 실행할 컴퓨터에서 단일 명령을 실행합니다.

```bash
npx laf-bridge pair
```

4. Bridge 프롬프트에 setup code를 붙여넣습니다.
5. 웹 UI에서 Bridge 상태, 감지된 Codex CLI 또는 Claude Code, 실행 로그와 영수증을 확인합니다.

운영 사용자는 별도 로컬 앱 서버나 두 번째 로컬 실행 컴포넌트를 시작하지
않습니다. 로컬 Go 서버는 기여자 개발 및 테스트용으로만 사용합니다.

### 호스팅과 LAF Bridge

LAF-Office의 운영 구조는 웹호스팅 워크스페이스와 사용자의 컴퓨터에서 실행되는
단일 LAF Bridge입니다.

중요한 경계:

- 웹 브라우저와 호스팅 API는 사용자의 로컬 Codex/Claude CLI를 직접 실행하지 않습니다.
- 호스팅된 워크스페이스에서 로컬 코드 작업을 실행하려면 LAF Bridge가 연결되어야 합니다.
- Bridge가 없어도 프로젝트 관리, 태스크 기록, 위키, 리뷰 큐는 사용할 수 있습니다.
- Bridge가 연결되면 Bridge가 작업을 받아 로컬 파일시스템, git, GitHub CLI, 에이전트 CLI를 사용해 실행합니다.

호스팅 UI의 **Settings -> LAF Bridge**에서 setup code를 만든 뒤, 작업을
실행할 컴퓨터에서 단일 명령을 실행하고 프롬프트에 코드를 붙여넣습니다.

```bash
npx laf-bridge pair
```

이 명령은 페어링 후 Bridge 루프를 바로 시작합니다. 로컬 CLI 실행을 받을 동안
터미널을 열어두세요.

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

백엔드와 Bridge/로컬 런타임 테스트:

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

기여자 전용 로컬 확인입니다. 개발용 Go 서버를 시작하는 절차이며 운영 사용자
경로가 아닙니다.

```bash
go run ./cmd/laf-office --no-open --provider codex --web-port 7891
curl -I http://localhost:7891
curl -fsS http://localhost:7891/api/bridge/availability
```

참고: 현재 전체 `web npm run check`는 기존 lint backlog 때문에 실패할 수
있습니다. PR 리뷰 전에는 변경 파일 중심의 lint와 함께 `typecheck`,
`npm test`, `npm run build`, `go test ./...`를 우선 기준으로 사용하세요.

### 로컬 개발자 명령

```bash
laf-office init          # 첫 설정
laf-office --no-open     # 브라우저 자동 실행 없이 시작
laf-office --provider codex
laf-office --provider claude-code
laf-office --collab      # 모든 에이전트가 같은 채널을 보는 협업 모드
laf-office shred         # 개발 워크스페이스 상태 초기화
```

### 문서

- [ARCHITECTURE.md](ARCHITECTURE.md): 호스팅 워크스페이스와 Bridge 구조
- [AGENTS.md](AGENTS.md): 에이전트 운영 규칙
- [FORKING.md](FORKING.md): 포크/브랜딩 변경 가이드
- [PROJECT-TASK-TRACKING-MVP.md](docs/specs/PROJECT-TASK-TRACKING-MVP.md): 프로젝트 태스크 보드
- [HOSTED-BRIDGE-PROTOCOL.md](docs/specs/HOSTED-BRIDGE-PROTOCOL.md): hosted Bridge 프로토콜
- [WIKI-SCHEMA.md](docs/specs/WIKI-SCHEMA.md): markdown wiki 계약

### 상태

LAF-Office는 pre-1.0 프로젝트입니다. `main`은 빠르게 움직입니다. 제품에
포크하거나 배포하려면 release tag를 기준으로 고정하는 것을 권장합니다.

라이선스: MIT

---

## English

### A hosted AI development workspace for small startup teams

LAF-Office is a hosted workspace for planning product work with AI agents,
breaking it into tasks, executing implementation lanes through LAF Bridge,
reviewing results, and keeping durable team memory.

The browser UI shows projects, tasks, agent activity, wiki memory, and delivery
receipts. The hosted web app never runs local CLIs directly; the connected
LAF Bridge owns filesystem, git, GitHub, Codex/Claude CLI execution, and result
uploads.

### Highlights

- **Project task boards**: Track project-scoped tasks, owners, status, review, and delivery.
- **AI team runtime**: CEO, Frontend Engineer, Backend Engineer, and Reviewer are the default team.
- **Bridge execution**: Connect Codex CLI or Claude Code through LAF Bridge.
- **LAF Bridge**: Hosted web apps queue work; the connected bridge owns filesystem, git, GitHub, and CLI execution.
- **Team memory**: Shared team wiki plus per-agent notebooks keep project context and execution receipts together.
- **Visible workflow**: Agent replies, task state, PR receipts, and wiki updates remain inspectable.

### Quick Start

Production user flow:

1. Sign in to the deployed LAF-Office web app.
2. Create a project and open **Settings -> LAF Bridge** to create a setup code.
3. On the computer that should execute work, run `npx laf-bridge pair`.

```bash
npx laf-bridge pair
```

4. Paste the setup code when Bridge prompts for it.
5. Confirm Bridge status, detected Codex/Claude CLI, execution logs, and receipts in the web UI.

Production users do not start a separate local app server or second local
execution component. The local Go server is for contributor development and
testing only.

### Hosted Workspace and LAF Bridge

LAF-Office's production shape is a hosted web workspace plus one local
LAF Bridge on the user's computer.

Important boundary:

- The browser and hosted API do not directly run a user's local Codex/Claude CLI.
- Hosted local-code execution requires a paired LAF Bridge.
- Without a bridge, project management, task records, wiki, and review queues still work.
- With a bridge, LAF Bridge receives work and executes it using the local filesystem, git, GitHub CLI, and agent CLI.

In the hosted UI, open **Settings -> LAF Bridge**, create a setup code, run the
single command on the computer that should execute work, and paste the code when
prompted.

```bash
npx laf-bridge pair
```

The command starts the Bridge loop after pairing. Keep the terminal open while
you want this machine to receive local CLI work.

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

Backend and LAF Bridge tests:

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

Contributor-only local smoke test. This starts the development Go server and is
not the hosted production user path:

```bash
go run ./cmd/laf-office --no-open --provider codex --web-port 7891
curl -I http://localhost:7891
curl -fsS http://localhost:7891/api/bridge/availability
```

Note: the full `web npm run check` can fail on existing lint backlog. For PR
review, use targeted lint on changed files plus `typecheck`, `npm test`,
`npm run build`, and `go test ./...`.

### Local Developer Commands

```bash
laf-office init          # First-time setup
laf-office --no-open     # Start without opening a browser
laf-office --provider codex
laf-office --provider claude-code
laf-office --collab      # Shared-channel collaboration mode
laf-office shred         # Reset developer workspace state
```

### Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md): hosted workspace and Bridge architecture
- [AGENTS.md](AGENTS.md): agent operating rules
- [FORKING.md](FORKING.md): forking and rebranding guide
- [PROJECT-TASK-TRACKING-MVP.md](docs/specs/PROJECT-TASK-TRACKING-MVP.md): project task board
- [HOSTED-BRIDGE-PROTOCOL.md](docs/specs/HOSTED-BRIDGE-PROTOCOL.md): hosted Bridge protocol
- [WIKI-SCHEMA.md](docs/specs/WIKI-SCHEMA.md): markdown wiki contract

### Status

LAF-Office is pre-1.0. `main` moves quickly. If you fork or deploy it, pin to a
release tag rather than tracking `main` directly.

License: MIT
