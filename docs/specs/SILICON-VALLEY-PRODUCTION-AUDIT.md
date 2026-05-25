# Silicon Valley Production Audit

This document is the production reset contract for LAF-Office as a pure-cloud AI
Startup Office. It treats the current worktree as evidence, not as destiny. The
standard is: if this were rewritten from scratch for a top-tier Silicon Valley
startup, what fundamental problems would we refuse to carry forward?

## Evidence Baseline

- `api/[...path].js` is still a 4,773-line hosted API facade after the cloud pivot.
- `web/src/components/apps/TasksApp.tsx`, `SettingsApp.tsx`, `HomeApp.tsx`, and
  `SkillsApp.tsx` remain large app modules alongside newer Startup Office panels.
- Supabase migrations now remove obsolete execution schema and the linked remote
  Supabase project has applied through `20260525000000`; RLS exercise, backup,
  restore, and rollback drills are still not proven.
- The current release gate is deterministic and fake-provider friendly, but it
  does not prove live model, live Supabase, email, billing, DNS, or browser E2E.
- Go internals still contain a large local/headless/worktree-era runtime used by
  the legacy desktop product; the hosted product must not depend on it.
- The product strategy is now clearer, but business proof still depends on a
  real founder using and paying for the product.

## 200 Fundamental Problems

| ID | Area | Fundamental problem | Current evidence |
| --- | --- | --- | --- |
| SV-I001 | Positioning | The product still carries historical developer-workspace weight while the intended buyer is a non-developer founder. | README, docs, Go runtime, web apps |
| SV-I002 | Positioning | The wedge is not yet reduced to one painfully specific paid founder outcome. | strategy docs and Growth Center copy |
| SV-I003 | Positioning | The product promise spans strategy, operations, marketing, memory, approvals, and agents before one loop proves repeatable value. | Startup Office loops and docs |
| SV-I004 | Positioning | The Polsia comparison is not converted into concrete win/loss product requirements. | product docs |
| SV-I005 | Positioning | “Safer and transparent” is a theme, not yet a measurable trust system visible everywhere. | approvals, receipts, audit events |
| SV-I006 | Positioning | Founder onboarding does not yet force a single moment of value inside five minutes. | onboarding and demo seed |
| SV-I007 | Positioning | The product is not yet opinionated about which company stage it serves first. | company profile fields |
| SV-I008 | Positioning | Customer-success workflows are weaker than product workflows, so activation risk is high. | docs and beta goals |
| SV-I009 | Positioning | The public site describes the vision but does not yet prove a buyer-ready package. | website/index.html |
| SV-I010 | Positioning | The business model is represented as beta ops state, not a live pricing and entitlement system. | billing migration and API |
| SV-I011 | Architecture | The hosted API facade remains too large to reason about as a production service boundary. | `api/[...path].js` |
| SV-I012 | Architecture | Product domains are partially extracted, but routing, auth, billing, and Startup Office behavior still mix in one server file. | `api/[...path].js`, `api/lib/startup-office` |
| SV-I013 | Architecture | Legacy desktop/team runtime and hosted cloud product share too much repository and conceptual surface. | `internal/team`, `web/src/components/apps` |
| SV-I014 | Architecture | There is no explicit service ownership map for auth, office objects, memory, workers, billing, and notifications. | architecture docs |
| SV-I015 | Architecture | The cloud worker is a library-style worker, not a deployed independently operable service. | `workers/startup-office` |
| SV-I016 | Architecture | Data access uses ad hoc REST helper patterns instead of a typed repository contract across all domains. | API helpers |
| SV-I017 | Architecture | Startup Office modules are new but not yet enforced as the only path for company operations. | legacy apps still present |
| SV-I018 | Architecture | There is no event bus or outbox pattern for reliable side effects. | notification and receipt writes |
| SV-I019 | Architecture | The system lacks a clear synchronous vs asynchronous boundary contract. | loop run and worker job APIs |
| SV-I020 | Architecture | Multi-tenant business objects do not have a shared domain invariant layer. | assets, customers, metrics, signals |
| SV-I021 | API | API input validation is scattered and often handwritten per route. | route handlers |
| SV-I022 | API | API response shapes are not generated from a shared schema. | web API types and serializers |
| SV-I023 | API | Error responses are not consistently typed for clients and operators. | `HTTPError`, client unwraps |
| SV-I024 | API | Idempotency is not a first-class requirement for loop runs and approvals. | run creation routes |
| SV-I025 | API | Pagination is inconsistent across business objects and messages. | `limit` handling |
| SV-I026 | API | Filtering and sorting contracts are not documented or centrally tested. | repository query helpers |
| SV-I027 | API | Large export endpoints risk becoming unbounded operational hazards. | `/startup-office/export` |
| SV-I028 | API | Demo seed and production behavior share too much runtime path. | `handleStartupOfficeDemoSeed` |
| SV-I029 | API | Hosted command registries still coexist with legacy command concepts. | command routes and hooks |
| SV-I030 | API | Route-level authorization is implemented manually rather than declaratively. | `requirePermission` calls |
| SV-I031 | Data model | Migrations are append-only history, but the desired cloud schema is not captured as a canonical current-state schema. | `supabase/migrations` |
| SV-I032 | Data model | Obsolete no-op migrations preserve continuity but add cognitive load to fresh installs. | obsolete local migration files |
| SV-I033 | Data model | There is no automated Supabase reset test proving all migrations apply cleanly. | no DB reset gate |
| SV-I034 | Data model | RLS policies are written but not exercised against a real Supabase test database. | migration tests are static |
| SV-I035 | Data model | Audit events are generic and not yet guaranteed for every write. | audit helper and beta goals |
| SV-I036 | Data model | Business object schemas lack rich lifecycle history. | assets/customers/metrics/signals tables |
| SV-I037 | Data model | Company memory pages do not yet have conflict resolution as a domain primitive. | memory pages |
| SV-I038 | Data model | Soft deletion, retention, and purge semantics are not uniform. | archive fields and delete routes |
| SV-I039 | Data model | Billing, usage, and workspace limits are not normalized into a durable entitlement model. | workspace_billing |
| SV-I040 | Data model | Schema comments and database-level constraints do not fully encode product invariants. | migrations |
| SV-I041 | Security | Tenant isolation depends heavily on correct route membership checks plus RLS not yet live-tested. | auth routes, migrations |
| SV-I042 | Security | Service-role usage is broad and needs stricter internal boundaries. | hosted API env requirements |
| SV-I043 | Security | Support access policy is visible but not yet a complete impersonation and break-glass system. | policy API |
| SV-I044 | Security | Rate limits exist for auth but not uniformly for expensive AI and write actions. | rate limit helpers |
| SV-I045 | Security | Request body size limits are not enforced as a cross-cutting API policy. | route handlers |
| SV-I046 | Security | File upload security is not implemented for founder assets. | beta goals |
| SV-I047 | Security | Secrets scanning is present but not tied into the Startup Office release gate. | CI scripts |
| SV-I048 | Security | Permission names are maintained in multiple layers and can drift. | Go, JS, web types |
| SV-I049 | Security | External action approval policy is not enforced by a centralized policy engine. | policy route and loop templates |
| SV-I050 | Security | Privacy, retention, and model data use terms are not product-enforced. | docs and no legal artifacts |
| SV-I051 | AI worker | The model client is OpenAI-first and does not yet support robust provider failover. | `modelClient.js` |
| SV-I052 | AI worker | Fake-provider tests prove shape, not real model quality. | worker tests |
| SV-I053 | AI worker | Prompt templates are present but not versioned as production artifacts. | loop templates |
| SV-I054 | AI worker | Output quality checks are shallow compared with real founder decision risk. | `qualityChecks.js` |
| SV-I055 | AI worker | Source citation enforcement is not connected to live research or retrieval. | loop templates and context builder |
| SV-I056 | AI worker | Worker retries are not backed by a production queue with leases and dead letters. | worker job table |
| SV-I057 | AI worker | Model cost calculation is heuristic and not reconciled against provider billing. | cost metadata |
| SV-I058 | AI worker | Long-running work has no distributed cancellation contract. | cancel route and worker state |
| SV-I059 | AI worker | There is no red-team harness for hallucination, unsafe advice, and overclaiming. | output eval test |
| SV-I060 | AI worker | AI execution has no per-workspace tool permission manifest. | loops and skills |
| SV-I061 | Memory | Company memory is promising but not yet the source of truth for all company operations. | memory pages and wiki |
| SV-I062 | Memory | Wiki, notebook, memory pages, and operating objects overlap conceptually. | internal/team and Startup Office |
| SV-I063 | Memory | Retrieval quality is not measured against business-loop outcomes. | wiki tests vs loop tests |
| SV-I064 | Memory | Memory promotion lacks human-readable diff quality gates beyond basic preview. | approval metadata |
| SV-I065 | Memory | Provenance exists but does not yet support full audit replay. | receipts and memory pages |
| SV-I066 | Memory | Contradiction handling is stronger in the wiki layer than in Startup Office memory. | wiki lint vs memory pages |
| SV-I067 | Memory | Uploaded materials and assets are not part of retrieval. | asset upload pending |
| SV-I068 | Memory | Company profile edits do not yet materialize into canonical memory with approvals. | profile API |
| SV-I069 | Memory | Memory freshness and re-verification are not operationalized. | last verification fields |
| SV-I070 | Memory | Founder-facing memory explanations are not consistently present across screens. | Startup Office UI |
| SV-I071 | Workflow | Operating loops are not yet mapped to a complete founder workday. | loop definitions |
| SV-I072 | Workflow | Approval states exist but do not include every external-impact action type. | approvals table |
| SV-I073 | Workflow | Receipts exist but do not yet serve as a complete customer-trust ledger. | receipts timeline |
| SV-I074 | Workflow | Revision flow exists but lacks worker re-entry and quality comparison. | approval revise route |
| SV-I075 | Workflow | Loop dependencies and scheduling are not mature enough for a real operating cadence. | loop definitions |
| SV-I076 | Workflow | Notifications are recorded but not delivered through production channels. | notifications table |
| SV-I077 | Workflow | Founder delegation to human teammates is not as mature as AI loop execution. | team invites and channels |
| SV-I078 | Workflow | Skill invocation is not strongly tied to loop execution and receipts. | skills and loops |
| SV-I079 | Workflow | There is no policy-driven “draft only” mode per workspace. | policy API |
| SV-I080 | Workflow | Failed run recovery is not a full support workflow. | retry, failure receipt |
| SV-I081 | Frontend | The app still exposes large legacy surfaces alongside the new Startup Office. | apps directory |
| SV-I082 | Frontend | Tasks and Projects are hidden from primary shell but not removed from web code. | `TasksApp.tsx` |
| SV-I083 | Frontend | Settings is too large and mixes account, provider, model, team, and danger flows. | `SettingsApp.tsx` |
| SV-I084 | Frontend | Home orchestration is not yet fully aligned with Growth Center as the main surface. | `HomeApp.tsx` |
| SV-I085 | Frontend | Startup Office panels are small but still mostly read/update forms, not a polished operator cockpit. | startup-office components |
| SV-I086 | Frontend | Empty, loading, error, and optimistic states are not consistently designed across all panels. | UI tests and components |
| SV-I087 | Frontend | Mobile review and approval flows are not proven. | no mobile E2E gate |
| SV-I088 | Frontend | The product lacks a first-run guided founder success path after onboarding. | onboarding to Growth Center |
| SV-I089 | Frontend | Search, wiki, receipts, and objects feel like adjacent apps rather than one operating system. | app shell |
| SV-I090 | Frontend | UI copy is guarded against old terms but not continuously evaluated for conversion clarity. | surface guard |
| SV-I091 | Design system | The code uses a mixture of shadcn-style primitives, custom CSS, and historical styles. | styles and components |
| SV-I092 | Design system | Design tokens are not enforced as a typed system. | CSS files |
| SV-I093 | Design system | Accessibility checks are not in the release gate. | missing axe/Playwright gate |
| SV-I094 | Design system | Focus management for drawers, modals, and approval controls is not proven end to end. | component tests |
| SV-I095 | Design system | Visual regression is absent for the core founder flow. | no screenshot diff gate |
| SV-I096 | Design system | Localization coverage is incomplete for the new Startup Office. | i18n and component copy |
| SV-I097 | Design system | The static website and app design are not yet a single brand system. | website and web app |
| SV-I098 | Design system | Information density is not tuned for repeated daily operation. | Startup Office panels |
| SV-I099 | Design system | Critical actions do not have a uniform interaction grammar. | approve, run, export, revise |
| SV-I100 | Design system | There is no design QA checklist tied to release. | scripts |
| SV-I101 | Observability | Runs, approvals, notifications, and model calls lack production traces. | no telemetry integration |
| SV-I102 | Observability | Logs are not structured around workspace, run, and actor IDs everywhere. | server and worker logs |
| SV-I103 | Observability | There is no dashboard for latency, queue age, failure rate, or cost anomalies. | admin beta dashboard |
| SV-I104 | Observability | Alerting policy is missing for stuck jobs and failed notifications. | beta ops |
| SV-I105 | Observability | Audit logs are product data but not operational telemetry. | audit events |
| SV-I106 | Observability | Error budgets and SLOs are undefined. | docs |
| SV-I107 | Observability | There is no synthetic production smoke monitor. | release gate only local |
| SV-I108 | Observability | Browser-side errors are not collected. | frontend |
| SV-I109 | Observability | Support tooling lacks a timeline view from user action to model output. | admin dashboard |
| SV-I110 | Observability | Cost telemetry is not reconciled with billing state. | usage events |
| SV-I111 | Billing | Billing is manual state, not payment infrastructure. | workspace_billing |
| SV-I112 | Billing | Entitlements are read at run time but not centrally enforced across all premium features. | billing helpers |
| SV-I113 | Billing | Seat limits are not enforced. | invites and billing |
| SV-I114 | Billing | Storage limits are stored but not enforced. | storage_mb_limit |
| SV-I115 | Billing | Usage metering covers model runs but not all valuable actions. | usage events |
| SV-I116 | Billing | There is no customer invoice, receipt, or plan-change flow. | no Stripe |
| SV-I117 | Billing | Operator support notes are not a CRM. | billing state |
| SV-I118 | Billing | Trial conversion paths are not instrumented. | onboarding and beta ops |
| SV-I119 | Billing | Cost overrun protection is too coarse for real provider spikes. | monthly model spend limit |
| SV-I120 | Billing | Pricing packaging is not represented in product code or site. | website and docs |
| SV-I121 | Testing | The test suite is broad but not organized around buyer-critical journeys. | many unit tests |
| SV-I122 | Testing | Hosted API tests are highly valuable but too concentrated in one massive file. | `api/hosted-api.test.js` |
| SV-I123 | Testing | Browser E2E for signup-to-first-approved-loop is missing. | no Playwright gate |
| SV-I124 | Testing | Real Supabase RLS tests are missing. | migrations |
| SV-I125 | Testing | Live model smoke tests are intentionally absent from release gate. | fake provider |
| SV-I126 | Testing | Contract tests between web client types and API responses are not generated. | TypeScript types |
| SV-I127 | Testing | Accessibility tests are missing. | web tests |
| SV-I128 | Testing | Visual regression tests are missing. | UI |
| SV-I129 | Testing | Load and concurrency tests for loop runs are missing. | worker |
| SV-I130 | Testing | Disaster recovery tests are missing. | ops docs |
| SV-I131 | Release | The release gate does not include the new production audit. | scripts |
| SV-I132 | Release | Production deploy evidence is not captured in the repository. | no deployment manifest |
| SV-I133 | Release | Environment preflight validates config presence but not external reachability. | hosted-env preflight |
| SV-I134 | Release | Worker deployment is not independently packaged. | workers directory |
| SV-I135 | Release | CI still builds broad legacy Go surfaces that are not part of hosted SaaS. | Go packages |
| SV-I136 | Release | There is no staged rollout or feature flag plan for risky cloud loops. | docs |
| SV-I137 | Release | Database migration failure recovery is not rehearsed. | migrations |
| SV-I138 | Release | Secrets and config rotation are not a release checklist item. | env docs |
| SV-I139 | Release | Versioning is package-oriented, not SaaS release-oriented. | GoReleaser and npm |
| SV-I140 | Release | Post-release monitoring and rollback criteria are undefined. | docs |
| SV-I141 | Compliance | Privacy policy, DPA, and terms are not implemented as launch artifacts. | docs |
| SV-I142 | Compliance | AI output disclaimers are not consistently surfaced at decision points. | UI |
| SV-I143 | Compliance | Customer data retention is not a configurable workspace policy. | schema |
| SV-I144 | Compliance | Data deletion is not complete across company memory, assets, logs, and auth. | no deletion workflow |
| SV-I145 | Compliance | Support access lacks customer-visible consent and expiry mechanics. | policy |
| SV-I146 | Compliance | Regulated-domain guardrails are prompt text, not enforceable product policy. | templates |
| SV-I147 | Compliance | Export format is not designed for legal discovery or customer portability. | export endpoint |
| SV-I148 | Compliance | Subprocessor/model provider disclosure is not represented. | docs |
| SV-I149 | Compliance | Incident response is not operationalized. | beta goals |
| SV-I150 | Compliance | Security review artifacts are not attached to release gates. | CI |
| SV-I151 | Performance | API server cold-start and route dispatch performance are not measured. | Vercel-style facade |
| SV-I152 | Performance | Large summary endpoints may overfetch as workspace data grows. | growth summary |
| SV-I153 | Performance | Client bundles still include multiple large app surfaces. | web build output |
| SV-I154 | Performance | Search and memory retrieval are not optimized for Startup Office loops. | context builder |
| SV-I155 | Performance | Export, receipts, and object lists lack cursor-based pagination. | endpoints |
| SV-I156 | Performance | Worker concurrency and queue backpressure are not modeled. | worker jobs |
| SV-I157 | Performance | Repeated polling/refetch patterns are not audited for scale. | React Query usage |
| SV-I158 | Performance | Database indexes are present but not proven against realistic data volumes. | migrations |
| SV-I159 | Performance | Model call latency is not budgeted per loop. | worker |
| SV-I160 | Performance | Static marketing site and app assets are not performance-budgeted together. | website and web build |
| SV-I161 | Portability | Export exists but no import/restore path exists for a workspace. | export endpoint |
| SV-I162 | Portability | Users cannot migrate company memory into another account or workspace. | no import |
| SV-I163 | Portability | Artifacts lack stable public or private share URLs. | artifact viewer |
| SV-I164 | Portability | Receipts are not signed or immutable enough for external trust. | receipts |
| SV-I165 | Portability | Data schemas are not versioned in exported bundles. | export endpoint |
| SV-I166 | Portability | Workspace deletion and data download are not one coherent account flow. | settings |
| SV-I167 | Portability | Asset upload and material library are incomplete. | beta goals |
| SV-I168 | Portability | Customer CRM data lacks common CSV/API interoperability. | customers |
| SV-I169 | Portability | Wiki/company memory is not packaged for founder handoff. | memory pages |
| SV-I170 | Portability | There is no escrow or backup story for paid customers. | ops |
| SV-I171 | Reliability | Worker job state exists but does not prove exactly-once or at-least-once semantics. | worker jobs |
| SV-I172 | Reliability | Retries may duplicate side effects without idempotent writes. | retry route |
| SV-I173 | Reliability | Dead-letter handling is not implemented for failed cloud loops. | worker jobs |
| SV-I174 | Reliability | Notifications can be recorded without delivery guarantees. | notifications |
| SV-I175 | Reliability | Approval decisions do not guard every race condition between user and worker. | approval routes |
| SV-I176 | Reliability | Long-running model calls do not have durable timeout policy in schema. | worker |
| SV-I177 | Reliability | Partial failure between artifact, approval, receipt, and memory writes needs stronger transaction design. | service helpers |
| SV-I178 | Reliability | Health checks do not cover dependencies. | hosted API |
| SV-I179 | Reliability | Backup and restore are not verified. | no runbook evidence |
| SV-I180 | Reliability | There is no chaos or failure-injection suite for the core loop. | tests |
| SV-I181 | Developer experience | The repository contains two eras of product architecture, increasing onboarding cost. | internal/team and Startup Office |
| SV-I182 | Developer experience | Tests and docs sometimes contradict current completed state. | 100 goals vs scorecard |
| SV-I183 | Developer experience | API fixtures, fake providers, and demo seeds are not clearly separated by environment. | tests and demo seed |
| SV-I184 | Developer experience | Generated assets and manual code are mixed without a full generation check. | avatar scripts |
| SV-I185 | Developer experience | There is no single command proving all cloud SaaS invariants. | release gate gaps |
| SV-I186 | Developer experience | Local development still centers on the old CLI experience. | npm package and Go command |
| SV-I187 | Developer experience | Code ownership boundaries are not explicit. | docs |
| SV-I188 | Developer experience | Package naming and repo naming still reflect historical LAF Agents Office identity. | repo paths |
| SV-I189 | Developer experience | Static analysis/lint coverage is weaker than tests. | scripts |
| SV-I190 | Developer experience | New contributors cannot easily tell which surfaces are product vs legacy. | file tree |
| SV-I191 | Customer success | No real founder success checklist is implemented in-product. | beta goals |
| SV-I192 | Customer success | Support playbooks exist as intent, not workflow. | docs |
| SV-I193 | Customer success | First paid beta workspace is not proven. | goal context |
| SV-I194 | Customer success | Sales site lacks concrete before/after founder examples. | website |
| SV-I195 | Customer success | Onboarding email and approval notification loops are missing. | notifications |
| SV-I196 | Customer success | The product does not yet measure activation, retention, or outcome completion. | analytics absent |
| SV-I197 | Customer success | Demo seed is useful but may not reflect a founder's own business fast enough. | demo seed |
| SV-I198 | Customer success | There is no internal support console for customer workspace rescue. | admin dashboard limited |
| SV-I199 | Customer success | Pricing and acceptance criteria are not wired into the sales flow. | docs |
| SV-I200 | Customer success | The product cannot honestly claim “only secrets remain” until deployment, buyer proof, and ops drills exist. | current state |

## 100 Production Goals

| ID | Target | Exit criterion | Evidence gate |
| --- | --- | --- | --- |
| SV-G001 | Lock the first buyer wedge. | One paid-beta ICP, promise, price, and demo script are canonical. | product doc plus website copy check |
| SV-G002 | Define Polsia win/loss requirements. | Every competitor claim maps to a product feature or non-goal. | positioning spec |
| SV-G003 | Guarantee one-account one-company semantics. | Auth, onboarding, billing, and exports all use company workspace language. | API and UI tests |
| SV-G004 | Make first value happen in five minutes. | Signup to first useful artifact is browser-tested. | Playwright test |
| SV-G005 | Convert safety into metrics. | Trust, approval, citation, and receipt coverage are counted. | production audit gate |
| SV-G006 | Package the paid beta. | Pricing, limits, onboarding, and support promise are visible. | website and billing test |
| SV-G007 | Separate hosted SaaS from legacy runtime. | Release gate proves hosted code does not depend on local/headless runtime. | boundary checker |
| SV-G008 | Write a founder success checklist. | Operators can qualify activation per workspace. | admin dashboard |
| SV-G009 | Instrument buyer outcomes. | Activation, first approval, repeat loop, and export are tracked. | analytics events |
| SV-G010 | Prove first sale. | A real founder pays or signs beta terms and completes a loop. | external sales evidence |
| SV-G011 | Split the hosted API facade. | No single product route module exceeds an agreed size budget. | module size checker |
| SV-G012 | Create typed API contracts. | Web client types are generated or checked from API schemas. | contract tests |
| SV-G013 | Centralize authorization. | Routes declare required roles and permissions in one registry. | auth matrix test |
| SV-G014 | Centralize validation. | Every mutation uses shared schema validation and body limits. | validation tests |
| SV-G015 | Introduce an outbox. | Side effects use durable outbox records. | schema and tests |
| SV-G016 | Define async contracts. | Queued, running, retrying, failed, and canceled semantics are documented and tested. | worker tests |
| SV-G017 | Own every domain module. | Auth, billing, memory, loops, objects, notifications, and admin have owners. | architecture doc |
| SV-G018 | Decouple worker deployment. | Worker can deploy, run, and health-check independently. | deployment config |
| SV-G019 | Remove hidden legacy dependencies. | Hosted release can build without legacy local runtime packages. | CI job |
| SV-G020 | Add architecture decision records. | Major product and infra choices have dated ADRs. | docs check |
| SV-G021 | Publish canonical current schema. | Fresh schema and migration history both exist and agree. | DB reset |
| SV-G022 | Prove migrations on Supabase. | `supabase db reset` and policy tests pass locally. | CLI output |
| SV-G023 | Exercise RLS for all Startup Office tables. | Cross-tenant reads/writes fail with user tokens. | integration tests |
| SV-G024 | Add database comments and constraints. | Core invariants are encoded at the DB layer. | migration review |
| SV-G025 | Make audit complete. | Every Startup Office write emits a structured audit event. | audit coverage test |
| SV-G026 | Define deletion and retention. | Workspace deletion purges or schedules every table. | deletion test |
| SV-G027 | Version exports. | Export bundles include schema version and restore notes. | export test |
| SV-G028 | Add backup and restore drill. | Restore proves company data, memory, and receipts survive. | runbook evidence |
| SV-G029 | Normalize lifecycle states. | Objects, runs, approvals, notifications, and memory use shared state conventions. | schema tests |
| SV-G030 | Add realistic seed reset. | Demo workspaces can be reset safely outside production. | admin test |
| SV-G031 | Harden service-role boundaries. | Service role access is isolated behind repository functions. | code review gate |
| SV-G032 | Add rate limits for expensive actions. | Runs, approvals, invites, exports, and profile writes are bounded. | API tests |
| SV-G033 | Add idempotency keys. | Retries cannot duplicate runs, approvals, or artifacts. | API tests |
| SV-G034 | Enforce body limits. | Oversized payloads are rejected before DB writes. | API tests |
| SV-G035 | Add file upload controls. | Type, size, scan, and retention policies protect assets. | upload tests |
| SV-G036 | Implement support access consent. | Owner-visible, expiring support sessions gate staff access. | policy tests |
| SV-G037 | Add security release gate. | Secret scan, dependency audit, and boundary checks run together. | CI |
| SV-G038 | Unify permission definitions. | Go, JS, DB, and web permission lists cannot drift. | generated artifact |
| SV-G039 | Enforce regulated advice boundaries. | Legal/financial sensitive outputs require disclaimer and approval. | output eval |
| SV-G040 | Produce launch security packet. | Threat model, privacy terms, incident runbook, and review evidence are complete. | docs gate |
| SV-G041 | Add provider abstraction. | At least two model providers or one provider plus fallback are supported. | worker tests |
| SV-G042 | Version prompts. | Loop prompts are versioned, reviewable, and tied to receipts. | worker tests |
| SV-G043 | Upgrade output evaluation. | Rubrics cover usefulness, sources, risks, next actions, and unsafe claims. | eval suite |
| SV-G044 | Add live model smoke. | Non-release live smoke can verify one real model path. | manual gated script |
| SV-G045 | Enforce citations. | Research-like outputs cannot complete without source metadata. | worker tests |
| SV-G046 | Add retrieval over memory and assets. | Loop outputs cite company memory and uploaded materials. | integration tests |
| SV-G047 | Implement tool permission manifests. | Each loop declares allowed tools and external action policy. | manifest tests |
| SV-G048 | Add model cost reconciliation. | Estimated costs are compared with provider usage fields. | usage tests |
| SV-G049 | Add red-team scenarios. | Unsafe, hallucinated, and overclaiming outputs fail the gate. | eval tests |
| SV-G050 | Add dead-letter processing. | Failed worker jobs land in a visible recovery queue. | worker tests |
| SV-G051 | Unify wiki and company memory. | Founder-facing memory has one canonical source of truth. | architecture and tests |
| SV-G052 | Add memory conflict resolution. | Contradictions require explicit resolution before promotion. | memory tests |
| SV-G053 | Add memory freshness policy. | Stale claims surface for review by date and risk. | UI and API tests |
| SV-G054 | Make profile edits memory-backed. | Profile changes create approved memory updates. | API tests |
| SV-G055 | Add provenance replay. | Receipts can reconstruct inputs, prompt version, output, approval, and memory diffs. | receipt test |
| SV-G056 | Add asset-grounded retrieval. | Uploaded business materials become retrievable loop context. | retrieval tests |
| SV-G057 | Show why-this-output everywhere. | Artifacts and approvals show memory, source, and assumption basis. | UI tests |
| SV-G058 | Add memory export/import. | Founder can download and restore company memory. | export/import tests |
| SV-G059 | Add memory permission checks. | Sensitive pages respect workspace roles. | RLS tests |
| SV-G060 | Measure retrieval quality. | A business-loop retrieval eval tracks recall and precision. | eval report |
| SV-G061 | Map a founder operating week. | Loops cover the weekly cadence from strategy to growth review. | product spec |
| SV-G062 | Implement scheduled loops. | Weekly operator review can run on schedule with approval policy. | worker test |
| SV-G063 | Complete revision re-entry. | Revision notes restart worker generation with comparison. | API and worker tests |
| SV-G064 | Deliver notifications. | Invites, approvals, failures, and receipts can notify by email. | provider fake and live smoke |
| SV-G065 | Add skill invocation records. | Every run records selected skills and reasons. | receipt tests |
| SV-G066 | Add external action policy. | Publish, send, spend, and legal-sensitive actions are always gated. | policy tests |
| SV-G067 | Build support recovery workflows. | Operators can retry, cancel, annotate, and notify from admin. | admin tests |
| SV-G068 | Add dependency-aware loops. | Runs can wait on prior evidence or approvals. | workflow tests |
| SV-G069 | Make receipts immutable enough. | Receipts are append-only or signed after finalization. | DB tests |
| SV-G070 | Add customer-facing receipt view. | Founder can inspect and share safe receipt summaries. | UI tests |
| SV-G071 | Collapse legacy web surfaces. | Primary hosted app no longer ships confusing project/task-era UX. | route and bundle checks |
| SV-G072 | Build a polished operator cockpit. | Growth Center supports daily scan, action, review, and archive. | browser QA |
| SV-G073 | Add first-run guided flow. | Onboarding lands in a guided first loop with sample output. | Playwright |
| SV-G074 | Finish mobile approval UX. | Founder can approve/revise on mobile without layout issues. | screenshots |
| SV-G075 | Add empty/error/loading standards. | All panels have consistent states. | component tests |
| SV-G076 | Add accessibility gate. | Keyboard, focus, labels, and contrast are tested. | axe/Playwright |
| SV-G077 | Add visual regression. | Core screens have screenshot baselines. | browser tests |
| SV-G078 | Unify design tokens. | CSS tokens and components follow one design system. | style lint |
| SV-G079 | Complete localization. | Core beta flow works in Korean and English. | i18n tests |
| SV-G080 | Align website and app brand. | Static site and app share voice, hierarchy, and product promise. | visual review |
| SV-G081 | Add structured telemetry. | Every run has trace IDs across API, worker, DB, and UI. | log tests |
| SV-G082 | Add operational dashboards. | Latency, failures, queue age, approvals, and cost are visible. | admin UI |
| SV-G083 | Define SLOs. | Availability, run latency, notification latency, and data integrity SLOs exist. | ops docs |
| SV-G084 | Add alerts. | Stuck jobs, failed notifications, high cost, and auth spikes alert operators. | monitor config |
| SV-G085 | Add browser error collection. | Client exceptions include workspace-safe context. | telemetry test |
| SV-G086 | Add synthetic monitor. | Production smoke exercises login, profile, run, approval, receipt. | monitor |
| SV-G087 | Add incident runbook. | Data leak, tenant bug, worker outage, and billing abuse drills exist. | docs |
| SV-G088 | Add deployment runbook. | DNS, env, migrations, worker, rollback, and smoke are documented. | docs gate |
| SV-G089 | Add cost anomaly alerts. | Workspace spend spikes trigger throttles and alerts. | billing tests |
| SV-G090 | Add support timeline. | Operators see user action to model output sequence. | admin UI |
| SV-G091 | Integrate payment. | Stripe or signed manual billing agreement gates paid beta. | billing tests |
| SV-G092 | Enforce entitlements. | Seats, runs, storage, support, and model spend apply everywhere. | integration tests |
| SV-G093 | Add invoices and receipts. | Customers can see billing status and receipts. | UI/API tests |
| SV-G094 | Add plan-change workflow. | Trial, paid, paused, and canceled states have clear UX. | tests |
| SV-G095 | Add activation analytics. | Product tracks first loop, first approval, second loop, export. | analytics tests |
| SV-G096 | Add support playbooks. | Failed runs and confused approvals have operator scripts. | docs |
| SV-G097 | Add beta terms. | Privacy, DPA, AI use, retention, and deletion terms are ready. | legal docs |
| SV-G098 | Add sales page proof. | Website shows founder use cases, outcomes, and trust controls. | website QA |
| SV-G099 | Run production rehearsal. | A staging workspace completes full flow with live dependencies. | checklist |
| SV-G100 | Ship paid closed beta. | Only deploy-time secrets and real customer onboarding remain. | completion audit |

## Roadmap To Satisfy The Audit

| Phase | Focus | Goals covered | Exit gate |
| --- | --- | --- | --- |
| R1 | Audit lock and guardrails | SV-G001 to SV-G010 plus audit enforceability | audit checker passes and release gate includes it |
| R2 | Hosted architecture split | SV-G011 to SV-G020 | API facade shrinks and route contracts are typed |
| R3 | Database and tenant security | SV-G021 to SV-G040 | Supabase reset, RLS, idempotency, rate-limit, and body-limit tests pass |
| R4 | AI worker quality | SV-G041 to SV-G050 | prompt versions, citations, evals, dead letters, and live smoke exist |
| R5 | Memory and receipts | SV-G051 to SV-G070 | provenance replay, memory conflicts, retrieval, immutable receipts pass |
| R6 | Founder UX | SV-G071 to SV-G080 | Playwright, accessibility, mobile, visual regression pass |
| R7 | Production operations | SV-G081 to SV-G090 | telemetry, SLOs, alerts, runbooks, incident drills exist |
| R8 | Commercial beta | SV-G091 to SV-G100 | paid beta package, entitlements, terms, staging rehearsal, first customer proof |

## Current Completion Verdict

The goal is not complete. The repository has made real progress toward the
pure-cloud Startup Office, but current evidence does not yet prove a production
SaaS that only lacks final secrets. The immediate next engineering move is to
continue attacking the largest remaining root cause: the oversized hosted API
and missing typed contracts.

## Progress Log

- R1 audit lock is now executable through `npm run production:audit`, and the
  beta release gate runs it before surface, worker, API, UI, and build checks.
- R2 has started with a dedicated Startup Office route contract and dispatcher:
  `api/lib/startup-office/routes.js` now owns the contract list, and
  `api/lib/startup-office/dispatcher.test.js` pins route IDs, aliases, params,
  and dispatch behavior. The handler bodies still need to move out of the
  hosted facade.
- The linked `laf-agents-office` Supabase project was repaired from legacy
  8-digit migration history into 14-digit Supabase versions, then pushed through
  `20260525000000_remove_local_execution.sql`. A linked DB query confirms the
  obsolete device, queue, execution-plan, checkout-binding, and claim-function
  objects are absent.
