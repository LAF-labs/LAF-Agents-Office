# Silicon Valley Production Audit

This document is the production reset contract for LAF-Office as a pure-cloud AI
Startup Office. It treats the current worktree as evidence, not as destiny. The
standard is: if this were rewritten from scratch for a top-tier Silicon Valley
startup, what fundamental problems would we refuse to carry forward?

## Evidence Baseline

- `api/[...path].js` is still a 2,811-line hosted API facade after the cloud pivot.
- `web/src/components/apps/TasksApp.tsx`, `SettingsApp.tsx`, `HomeApp.tsx`, and
  `SkillsApp.tsx` remain large app modules alongside newer Startup Office panels.
- Supabase migrations now remove obsolete execution schema, and live PostgREST
  RLS verification seeds every Startup Office team-scoped table plus workspace
  billing/settings/audit fixtures across Alpha/Beta tenants; external backup,
  restore, and production deployment drills still require deploy-time evidence.
- The canonical current Supabase schema now lives in
  `supabase/schema/current.json` and is checked against migrations by
  `npm run startup-office:schema`.
- Workspace roles, permissions, and role presets now have a shared catalog at
  `shared/workspace-permissions.json`; the release gate checks API and web
  generated artifacts for drift.
- Startup Office routes now have a declarative authorization registry at
  `api/lib/startup-office/authorization.js`; the release gate verifies each
  route method maps to a known permission or admin-only policy.
- Startup Office mutating routes now have a declared audit coverage map at
  `scripts/check-startup-office-audit-coverage.cjs`; the release gate fails if a
  new `POST`, `PATCH`, or `DELETE` route is added without an audit event.
- The current release gate is deterministic, fake-provider friendly, and now
  includes audit coverage, secret scan, and dependency audit, but it does not
  prove live model, live Supabase, email, billing, DNS, or browser E2E.
- Legacy Go, CLI, npm-wrapper, native-release, and device-runtime scripts have
  been removed from the tracked hosted SaaS tree and are now guarded by the
  release gate.
- The product strategy is now clearer, but business proof still depends on a
  real founder using and paying for the product.

## 200 Fundamental Problems

| ID | Area | Fundamental problem | Current evidence |
| --- | --- | --- | --- |
| SV-I001 | Positioning | The product still carries historical developer-workspace weight while the intended buyer is a non-developer founder. | docs and large web app modules |
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
| SV-I012 | Architecture | Product domains are partially extracted, but older project/task-era workspace behavior still mixes into the hosted server file. | `api/[...path].js`, `api/lib/startup-office`, `api/lib/hosted` |
| SV-I013 | Architecture | Large legacy-adjacent web app modules still coexist with the focused hosted Startup Office. | `web/src/components/apps` |
| SV-I014 | Architecture | There is no explicit service ownership map for auth, office objects, memory, workers, billing, and notifications. | architecture docs |
| SV-I015 | Architecture | The AI loop and outbox workers now have scheduled deploy surfaces, but they still run through GitHub Actions rather than a dedicated long-lived worker platform. | `workers/startup-office` |
| SV-I016 | Architecture | Data access uses ad hoc REST helper patterns instead of a typed repository contract across all domains. | API helpers |
| SV-I017 | Architecture | Startup Office modules are new but not yet enforced as the only path for company operations. | legacy apps still present |
| SV-I018 | Architecture | The outbox now has atomic claim, delivery worker, and Resend adapter, but live provider smoke and reconciliation remain. | notification and receipt writes |
| SV-I019 | Architecture | Loop runs now have queued worker jobs, leases, retries, and dead letters, but the public API contract still needs stronger async state documentation. | loop run and worker job APIs |
| SV-I020 | Architecture | Multi-tenant business objects do not have a shared domain invariant layer. | assets, customers, metrics, signals |
| SV-I021 | API | Core Startup Office loop mutations now use shared validation, but many route payloads remain handwritten. | route handlers |
| SV-I022 | API | API response shapes are not generated from a shared schema. | web API types and serializers |
| SV-I023 | API | Error responses are not consistently typed for clients and operators. | `HTTPError`, client unwraps |
| SV-I024 | API | Core run creation, run retry/cancel, approval decisions, and worker artifact/approval paths now carry idempotency keys, but lower-risk object CRUD still needs the same contract. | run lifecycle routes |
| SV-I025 | API | Pagination is inconsistent across business objects and messages. | `limit` handling |
| SV-I026 | API | Filtering and sorting contracts are not documented or centrally tested. | repository query helpers |
| SV-I027 | API | Large export endpoints risk becoming unbounded operational hazards. | `/startup-office/export` |
| SV-I028 | API | Demo seed is now isolated from the facade, but production and demo records still share the same tables and need stronger environment policy. | `api/lib/startup-office/demoSeedHandlers.js` |
| SV-I029 | API | Hosted command registries still coexist with legacy command concepts. | command routes and hooks |
| SV-I030 | API | Startup Office route-level authorization now has a declarative registry, but older hosted facade routes still use manual checks. | `startup-office:authorization` |
| SV-I031 | Data model | A canonical current schema now exists, but it is still statically checked rather than proven by a local Supabase reset and live RLS exercise. | `supabase/schema/current.json`, schema gate |
| SV-I032 | Data model | Obsolete no-op migrations preserve continuity but add cognitive load to fresh installs. | obsolete local migration files |
| SV-I033 | Data model | There is no automated Supabase reset test proving all migrations apply cleanly. | no DB reset gate |
| SV-I034 | Data model | RLS policies are written but not exercised against a real Supabase test database. | migration tests are static |
| SV-I035 | Data model | Startup Office route writes are now machine-checked for audit events, but live audit replay, export, and operator review are not proven. | `startup-office:audit-coverage` |
| SV-I036 | Data model | Business object schemas lack rich lifecycle history. | assets/customers/metrics/signals tables |
| SV-I037 | Data model | Company memory pages do not yet have conflict resolution as a domain primitive. | memory pages |
| SV-I038 | Data model | Workspace-wide deletion now has a manifest, request flow, service-role purge RPC, and tombstone proof; long-term configurable retention tiers remain future work. | `startup-office:deletion-coverage` |
| SV-I039 | Data model | Billing, usage, and workspace limits are not normalized into a durable entitlement model. | workspace_billing |
| SV-I040 | Data model | Schema comments and database-level constraints do not fully encode product invariants. | migrations |
| SV-I041 | Security | Tenant isolation depends heavily on correct route membership checks plus RLS not yet live-tested. | auth routes, migrations |
| SV-I042 | Security | Service-role REST/RPC access is now manifest-allowlisted, but domain repositories still need narrower ownership boundaries. | hosted API env requirements |
| SV-I043 | Security | Support access policy is visible but not yet a complete impersonation and break-glass system. | policy API |
| SV-I044 | Security | Rate limits now cover the full Startup Office mutating route contract at ingress, but downstream provider and worker-specific quota policies still need live production tuning. | `startup-office:rate-limits` |
| SV-I045 | Security | Request body size limits are enforced at API ingress, but route payload schemas still need a shared validation contract. | `readBody`, route handlers |
| SV-I046 | Security | File upload security is not implemented for founder assets. | beta goals |
| SV-I047 | Security | Secret scan and high-severity dependency audit are tied into the Startup Office release gate, but SAST/DAST and a launch security packet remain incomplete. | `startup-office:security` |
| SV-I048 | Security | Workspace permissions now use one shared catalog with API/web drift checks; route-level authorization still needs a full declarative matrix. | `startup-office:permissions` |
| SV-I049 | Security | External action approval policy is not enforced by a centralized policy engine. | policy route and loop templates |
| SV-I050 | Security | Privacy, retention, and model data use terms are not product-enforced. | docs and no legal artifacts |
| SV-I051 | AI worker | The model client is OpenAI-first and does not yet support robust provider failover. | `modelClient.js` |
| SV-I052 | AI worker | Fake-provider tests prove shape, not real model quality. | worker tests |
| SV-I053 | AI worker | Prompt templates now have a version manifest, instruction/schema hashes, review scope, and receipt/run metadata traces. | `startup-office:prompt-versions`, worker tests |
| SV-I054 | AI worker | Output quality checks now cover structure, sources, assumptions, external-action claims, overclaiming, and regulated-advice review language; real model evals remain a post-beta hardening need. | `qualityChecks.js` |
| SV-I055 | AI worker | Source citation enforcement is not connected to live research or retrieval. | loop templates and context builder |
| SV-I056 | AI worker | Worker retries now have service-role leases and dead letters, but live replay and operator recovery UX remain incomplete. | worker job table |
| SV-I057 | AI worker | Model cost calculation is heuristic and not reconciled against provider billing. | cost metadata |
| SV-I058 | AI worker | Long-running work now has a distributed cancellation contract across API cancel, worker-job state, and loop side-effect guards; live provider abort signals remain future hardening. | `startup-office:cancellation`, worker tests |
| SV-I059 | AI worker | There is no red-team harness for hallucination, unsafe advice, and overclaiming. | output eval test |
| SV-I060 | AI worker | Loop tool permission manifests now exist, but live connector-level enforcement must stay tied to this contract as new tools are added. | `workers/startup-office/toolPolicy.js`, `startup-office:tool-policy` |
| SV-I061 | Memory | Company memory is promising but not yet the source of truth for all company operations. | memory pages and wiki |
| SV-I062 | Memory | Wiki, notebook, memory pages, and operating objects overlap conceptually. | hosted wiki and Startup Office |
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
| SV-I076 | Workflow | Notifications can be delivered through in-app or Resend email paths, but live provider smoke is still manual. | notifications table |
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
| SV-I104 | Observability | Scheduled GitHub Actions monitoring now fails on dead-letter rows, stuck jobs, stale approvals, and model-spend anomalies; external paging and auth-spike routing remain. | beta ops |
| SV-I105 | Observability | Audit logs are product data but not operational telemetry. | audit events |
| SV-I106 | Observability | Error budgets and SLOs are undefined. | docs |
| SV-I107 | Observability | A deployed synthetic monitor now exercises login, profile, live loop run, approval, receipt, and logout; external credentials and run evidence are still deploy-time proof. | synthetic monitor |
| SV-I108 | Observability | Browser-side errors now report workspace-scoped, redacted client telemetry, but external paging and session replay are not included. | frontend |
| SV-I109 | Observability | Support tooling now has an admin timeline from user/audit events through worker jobs, approvals, receipts, notifications, outbox, and client errors; richer paging remains. | admin dashboard |
| SV-I110 | Observability | Cost telemetry now feeds billing entitlements and spend alerts; provider invoice reconciliation remains external. | usage events |
| SV-I111 | Billing | Paid beta billing now requires signed manual or Stripe/payment evidence, but live charge capture still depends on deploy-time provider setup. | commercial billing document |
| SV-I112 | Billing | Entitlements now derive from billing, commercial evidence, usage, seats, storage, and model spend; external provider entitlement sync remains. | billing helpers |
| SV-I113 | Billing | Seat limits are enforced for workspace invites, with external identity-provider sync still deploy-time. | invites and billing |
| SV-I114 | Billing | Storage limits are enforced for Startup Office writes and assets; provider bucket quotas remain deploy-time. | storage_mb_limit |
| SV-I115 | Billing | Usage metering covers model runs but not all valuable actions. | usage events |
| SV-I116 | Billing | Customers can see billing agreements, invoices, receipts, and plan changes in beta ops; live Stripe invoice sync remains external. | commercial billing document |
| SV-I117 | Billing | Operator support notes are not a CRM. | billing state |
| SV-I118 | Billing | Trial conversion now records activation milestones for first loop, first approval, second loop, and first export; paid conversion proof still requires customer/payment evidence. | activation analytics |
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
| SV-I133 | Release | Environment preflight now validates hosted config, outbox email, and AI provider shape, but not live external reachability. | hosted-env preflight |
| SV-I134 | Release | The outbox and AI loop workers are independently scheduled, but production deploy evidence and live smoke are still missing. | workers directory |
| SV-I135 | Release | CI is now hosted-only but still lacks a production deploy smoke with live environment reachability. | `.github/workflows/ci.yml` |
| SV-I136 | Release | There is no staged rollout or feature flag plan for risky cloud loops. | docs |
| SV-I137 | Release | Database migration failure recovery is not rehearsed. | migrations |
| SV-I138 | Release | Secrets and config rotation are not a release checklist item. | env docs |
| SV-I139 | Release | Versioning is not yet SaaS release-oriented around deployments, migrations, and rollback evidence. | release docs |
| SV-I140 | Release | Post-release monitoring and rollback criteria are undefined. | docs |
| SV-I141 | Compliance | Privacy policy, DPA, and terms are not implemented as launch artifacts. | docs |
| SV-I142 | Compliance | AI output disclaimers are not consistently surfaced at decision points. | UI |
| SV-I143 | Compliance | Customer data retention is not a configurable workspace policy. | schema |
| SV-I144 | Compliance | Data deletion now purges workspace-scoped product tables through the team cascade with receipt-delete bypass scoped to the purge transaction; auth-user deletion and external provider retention remain operator/legal follow-up. | `purge_startup_office_workspace` |
| SV-I145 | Compliance | Support access lacks customer-visible consent and expiry mechanics. | policy |
| SV-I146 | Compliance | Regulated-domain guardrails are prompt text, not enforceable product policy. | templates |
| SV-I147 | Compliance | Export now has a schema-derived v2 manifest and documented omissions; import/restore tooling remains future work. | `startup-office:export-coverage` |
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
| SV-I164 | Portability | Receipts are now DB append-only, but not yet signed or shareable enough for external trust. | receipts |
| SV-I165 | Portability | Data schemas are not versioned in exported bundles. | export endpoint |
| SV-I166 | Portability | Workspace deletion and data download are not one coherent account flow. | settings |
| SV-I167 | Portability | Asset upload and material library are incomplete. | beta goals |
| SV-I168 | Portability | Customer CRM data lacks common CSV/API interoperability. | customers |
| SV-I169 | Portability | Wiki/company memory is not packaged for founder handoff. | memory pages |
| SV-I170 | Portability | There is no escrow or backup story for paid customers. | ops |
| SV-I171 | Reliability | Worker jobs now claim with leases and idempotent side effects, but exactly-once semantics still need concurrency and crash-recovery proof. | worker jobs |
| SV-I172 | Reliability | Startup Office loop side effects and run lifecycle retries are idempotency-keyed across direct and scheduled worker paths, but exactly-once semantics still need deeper concurrency proof. | run lifecycle routes |
| SV-I173 | Reliability | Failed cloud loops now dead-letter at the worker job layer and have admin retry/cancel APIs, but founder-facing recovery UI is not complete. | worker jobs |
| SV-I174 | Reliability | Notifications now enqueue durable outbox rows with retry/dead-letter handling and a Resend adapter, but provider reconciliation is incomplete. | notifications |
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
| SV-I186 | Developer experience | Local development is hosted-first but not yet one-command reproducible for web, API, worker, and Supabase. | `DEVELOPMENT.md` |
| SV-I187 | Developer experience | Code ownership boundaries are not explicit. | docs |
| SV-I188 | Developer experience | Package naming and repo naming still reflect historical LAF Agents Office identity. | repo paths |
| SV-I189 | Developer experience | Static analysis/lint coverage is weaker than tests. | scripts |
| SV-I190 | Developer experience | New contributors cannot easily tell which surfaces are product vs legacy. | file tree |
| SV-I191 | Customer success | No real founder success checklist is implemented in-product. | beta goals |
| SV-I192 | Customer success | Support playbooks now appear in the admin beta dashboard for failed runs, confused approvals, notification recovery, billing blocks, and customer-success review. | support playbooks |
| SV-I193 | Customer success | First paid beta workspace is not proven. | goal context |
| SV-I194 | Customer success | Sales site lacks concrete before/after founder examples. | website |
| SV-I195 | Customer success | Onboarding email and approval notification loops are missing. | notifications |
| SV-I196 | Customer success | The product now measures activation milestones in beta ops; retention and long-term outcome completion remain external/next-stage analytics. | activation analytics |
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
| SV-G007 | Separate hosted SaaS from legacy runtime. | Release gate proves hosted code does not depend on customer-managed runtime. | boundary checker |
| SV-G008 | Write a founder success checklist. | Operators can qualify activation per workspace. | admin dashboard |
| SV-G009 | Instrument buyer outcomes. | Activation, first approval, repeat loop, and export are tracked. | analytics events |
| SV-G010 | Prove first sale. | A real founder pays or signs beta terms and completes a loop. | external sales evidence |
| SV-G011 | Split the hosted API facade. | No single product route module exceeds an agreed size budget. | module size checker |
| SV-G012 | Create typed API contracts. | Web client types are generated or checked from API schemas. | contract tests |
| SV-G013 | Centralize authorization. | Startup Office routes declare required roles and permissions in one registry. | `startup-office:authorization` |
| SV-G014 | Centralize validation. | Every mutation uses shared schema validation and body limits. | validation tests |
| SV-G015 | Introduce an outbox. | Side effects use durable outbox records. | schema and tests |
| SV-G016 | Define async contracts. | Queued, running, retrying, failed, and canceled semantics are documented and tested. | worker tests |
| SV-G017 | Own every domain module. | Auth, billing, memory, loops, objects, notifications, and admin have owners. | architecture doc |
| SV-G018 | Decouple worker deployment. | AI loop and outbox workers can deploy, run, and health-check independently. | deployment config |
| SV-G019 | Remove hidden legacy dependencies. | Hosted release can build without retired runtime packages. | CI job |
| SV-G020 | Add architecture decision records. | Major product and infra choices have dated ADRs. | docs check |
| SV-G021 | Publish canonical current schema. | Fresh schema and migration history both exist and agree. | DB reset |
| SV-G022 | Prove migrations on Supabase. | `supabase db reset` and policy tests pass locally. | CLI output |
| SV-G023 | Exercise RLS for all Startup Office tables. | Cross-tenant reads/writes fail with user tokens. | integration tests |
| SV-G024 | Add database comments and constraints. | Core invariants are encoded at the DB layer. | migration review |
| SV-G025 | Make audit complete. | Every Startup Office write emits a structured audit event. | `startup-office:audit-coverage` |
| SV-G026 | Define deletion and retention. | Workspace deletion has a schema-derived manifest, service-role purge RPC, tombstone proof, and release-gate coverage. | `startup-office:deletion-coverage` |
| SV-G027 | Version exports. | Export bundles include schema version, restore notes, export manifest, and schema-derived coverage checks. | `startup-office:export-coverage` |
| SV-G028 | Add backup and restore drill. | Restore proves company data, memory, and receipts survive. | runbook evidence |
| SV-G029 | Normalize lifecycle states. | Objects, runs, approvals, notifications, and memory use shared state conventions. | schema tests |
| SV-G030 | Add realistic seed reset. | Demo workspaces can be reset safely outside production. | admin test |
| SV-G031 | Harden service-role boundaries. | Service role access is isolated behind repository functions. | code review gate |
| SV-G032 | Add rate limits for expensive actions. | Runs, approvals, invites, exports, profile writes, admin recovery actions, support/deletion actions, asset upload intents, artifact actions, and operating-object writes are bounded. | `startup-office:rate-limits` |
| SV-G033 | Add idempotency keys. | Retries cannot duplicate runs, run retries/cancellations, approvals, or artifacts. | `startup-office:idempotency` |
| SV-G034 | Enforce body limits. | Oversized payloads are rejected before DB writes. | API tests |
| SV-G035 | Add file upload controls. | Type, size, scan, and retention policies protect assets. | upload tests |
| SV-G036 | Implement support access consent. | Owner-visible, expiring support sessions gate staff access. | policy tests |
| SV-G037 | Add security release gate. | Secret scan, high-severity dependency audit, and boundary checks run together. | `startup-office:security` |
| SV-G038 | Unify permission definitions. | API and web permission lists cannot drift from the shared catalog. | `startup-office:permissions` |
| SV-G039 | Enforce regulated advice boundaries. | Legal/financial sensitive outputs require disclaimer and approval. | output eval |
| SV-G040 | Produce launch security packet. | Threat model, privacy terms, incident runbook, and review evidence are complete. | docs gate |
| SV-G041 | Add provider abstraction. | At least two model providers or one provider plus fallback are supported. | worker tests |
| SV-G042 | Version prompts. | Loop prompts are versioned, reviewable, hashed, and tied to model calls, runs, artifacts, approvals, worker jobs, and receipts. | `startup-office:prompt-versions`, worker tests |
| SV-G043 | Upgrade output evaluation. | Rubrics cover usefulness, sources, risks, next actions, unsafe external-action claims, overclaiming, and regulated-advice review. | eval suite |
| SV-G044 | Add live model smoke. | Non-release live smoke can verify one real model path. | manual gated script |
| SV-G045 | Enforce citations. | Research-like outputs cannot complete without source metadata. | worker tests |
| SV-G046 | Add retrieval over memory and assets. | Loop outputs cite company memory and uploaded materials. | integration tests |
| SV-G047 | Implement tool permission manifests. | Each loop declares allowed tools, disallowed external-execution tools, and external action policy; worker prompts, metadata, approvals, jobs, and receipts record the policy snapshot. | `startup-office:tool-policy`, worker tests |
| SV-G048 | Add model cost reconciliation. | Estimated costs are compared with provider usage fields. | usage tests |
| SV-G049 | Add red-team scenarios. | Unsafe, hallucinated, and overclaiming outputs fail the gate. | eval tests |
| SV-G050 | Add dead-letter processing. | Failed worker jobs land in a visible recovery queue and scheduled monitor. | worker tests |
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
| SV-G069 | Make receipts externally verifiable. | Receipts are append-only in Supabase and can later be signed for third-party trust. | DB gate and receipt tests |
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
| SV-G084 | Add alerts. | Stuck jobs, failed notifications, stale approvals, and model-spend anomalies trip a scheduled monitor; auth spikes still need alert wiring. | monitor config |
| SV-G085 | Add browser error collection. | Client exceptions include workspace-safe context. | telemetry test |
| SV-G086 | Add synthetic monitor. | Production smoke exercises login, profile, live run, approval, receipt, and logout. | synthetic monitor |
| SV-G087 | Add incident runbook. | Data leak, tenant bug, worker outage, and billing abuse drills exist. | docs |
| SV-G088 | Add deployment runbook. | DNS, env, migrations, worker, rollback, and smoke are documented. | docs gate |
| SV-G089 | Add cost anomaly alerts. | Global model spend, single-event cost spikes, and current-month workspace spend ratios trip scheduled monitor failures. | ops monitor tests |
| SV-G090 | Add support timeline. | Operators see user action, worker/model, approval, receipt, notification, outbox, and client-error sequence. | admin API |
| SV-G091 | Integrate payment. | Stripe references or signed manual billing agreements are required before paid beta can be marked ready. | billing tests |
| SV-G092 | Enforce entitlements. | Central entitlements block AI runs on billing state, monthly runs, and model spend while exposing seat, storage, support, and managed-model availability. | billing/workflow tests |
| SV-G093 | Add invoices and receipts. | Customers can see billing agreements, invoices, payment receipts, and commercial status in beta ops. | UI/API tests |
| SV-G094 | Add plan-change workflow. | Trial, paid, paused, and canceled plan transitions create commercial billing document evidence. | tests |
| SV-G095 | Add activation analytics. | Product records durable first loop, first approval, second loop, and first export milestones and exposes progress in beta ops. | analytics tests |
| SV-G096 | Add support playbooks. | Failed runs, confused approvals, notification delivery, billing blocks, and clean customer-success review have operator scripts in beta dashboard and launch docs. | API/docs tests |
| SV-G097 | Add beta terms. | Privacy, DPA, AI use, retention, and deletion terms are versioned, accepted in-product, audited, and required before paid beta readiness. | legal/API/UI tests |
| SV-G098 | Add sales page proof. | Signup entry screen shows founder use cases, beta outcomes, and trust controls with regression coverage. | website QA |
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

Repository-controlled closed beta readiness is complete through G098 and is now
locked by `npm run closed-beta:goals`. G099 and G100 remain blocked only by
external proof: a production-domain deployment with live Supabase, workers,
monitoring, and smoke evidence, then one real founder payment or signed beta
agreement with a first approved loop and receipt.

SV-G097 is now product-enforced rather than doc-only: the beta terms package in
`docs/legal/STARTUP-OFFICE-BETA-TERMS.md` is versioned in
`api/lib/startup-office/betaTerms.js`, accepted through `/startup-office/terms`,
recorded in `startup_office_terms_acceptances`, shown in beta ops, audited as
`startup_office.terms_accepted`, and included in the paid beta commercial gate.
SV-G098 is covered on the unauthenticated signup entry screen: founder use
cases, beta outcomes, and trust controls are visible before account creation and
locked by `npm run startup-office:sales-proof` plus the auth UI regression test.
SV-G047 is now covered by a versioned loop tool-policy manifest:
`workers/startup-office/toolPolicy.js` declares allowed tools, blocked execution
tools, and external action policy per loop; the AI worker injects that policy
into prompts and records it on runs, artifacts, approvals, worker jobs, and
receipts. `npm run startup-office:tool-policy` and
`workers/startup-office/toolPolicy.test.js` prevent new loops from shipping
without the same founder-control contract.
SV-I058 is now materially reduced by a distributed cancellation guard: canceling
a run updates open queued/running/failed worker jobs, records the canceled job
count on the founder receipt and audit event, and the loop engine re-checks run
state before start, before model generation, after model generation, and on
failure so canceled work cannot write artifacts, approvals, or failed-run
receipts after the founder has stopped it. `npm run startup-office:cancellation`
locks this contract.
SV-G042 is now covered by a prompt version manifest:
`workers/startup-office/promptVersions.js` pins one version per loop, records
instruction and schema hashes, and carries reviewed-for evidence. The loop
engine injects that snapshot into prompt context and records it on model
metadata, runs, artifacts, approvals, worker jobs, and receipts.
`npm run startup-office:prompt-versions` keeps new loops from shipping without
the same traceability.
SV-G023 is now broader than representative spot checks: `npm run
startup-office:rls-live` applies every Supabase migration to a temporary
PostgreSQL cluster, starts PostgREST, seeds Alpha/Beta rows across every
`startup_office_*` table plus `company_profiles`, `workspace_billing`,
`workspace_settings`, and `audit_events`, and proves anon isolation,
authenticated same-tenant reads, cross-tenant read exclusion, cross-tenant
insert/update rejection across writable Startup Office tables, service-owned
direct-write rejection, and service-role bypass. `npm run
startup-office:rls-verification` now derives the required fixture table names
from `supabase/schema/current.json` so new Startup Office tables cannot silently
fall out of live RLS coverage.

The broader production audit is still not claimable as fully complete until
that external handoff evidence is attached. Engineering should use targeted
checks while closing grouped goals, then run `npm run beta:release-gate` once on
the final release commit or when a shared invariant changes.

## Progress Log

- R1 audit lock is now executable through `npm run production:audit`, and the
  beta release gate runs it before surface, worker, API, UI, and build checks.
- The G072-G100 final closed-beta tranche is now an executable invariant:
  `npm run closed-beta:goals` requires G072-G098 to stay complete, allows only
  G099 and G100 to remain blocked, and requires those blockers to point to
  external deployment/customer proof instead of repository work.
- R4 now includes a versioned tool permission manifest:
  `npm run startup-office:tool-policy` checks that every loop declares allowed
  tools, blocked external-execution tools, and never-auto-execute policy for
  publish, send, spend, legal-sensitive, pricing, and customer-promise actions.
- R4/R7 now adds distributed cancellation for AI loop runs:
  `npm run startup-office:cancellation` checks that API cancel propagates to
  open worker jobs and that the loop engine re-checks cancellation before
  side-effect writes after long model generation.
- R4 now versions prompt templates as production artifacts:
  `npm run startup-office:prompt-versions` checks that every loop has a stable
  prompt version, instruction hash, schema hash, review scope, prompt-context
  exposure, and receipt/run trace coverage.
- R2 has started with a dedicated Startup Office route contract and dispatcher:
  `api/lib/startup-office/routes.js` now owns the contract list, and
  `api/lib/startup-office/dispatcher.test.js` pins route IDs, aliases, params,
  and dispatch behavior. The handler bodies still need to move out of the
  hosted facade.
- R2 now extracts Startup Office operations and business-object handlers into
  dedicated modules with injected dependencies and unit tests. The hosted API
  facade is reduced from 4,773 to 4,635 lines, and
  `npm run startup-office:architecture` prevents those extracted handlers from
  moving back into `api/[...path].js`.
- R2 continues with query/read handlers for growth summary, loops, approvals,
  receipts, and export extracted behind tests. Exports now use
  `startup-office-export.v2` with a schema-derived manifest, restore notes,
  invite-token redaction, customer-visible legal/support evidence, and
  documented omissions for internal queues and post-deletion tombstones.
- R2 now extracts the execution workflow handlers for loop runs, run detail,
  cancel/retry, approval decisions, run-limit enforcement, usage metering, and
  notification recording. The hosted API facade is down to 4,130 lines, with
  workflow tests in the beta release gate.
- R2 now has a Startup Office API contract gate. Server route contracts declare
  the web client function, method, response type, and path snippets; the release
  gate verifies `web/src/api/startupOffice.ts` cannot drift silently.
- R2 now has a pure-cloud boundary gate. The repo no longer tracks the Go
  desktop runtime, npm CLI wrapper, native release artifacts, customer-managed
  execution scripts, or old TUI/E2E harnesses; `npm run startup-office:pure-cloud-boundary`
  blocks those paths and device-runtime terms from returning to hosted product
  code.
- R2 now extracts Startup Office company profile and demo seed behavior from
  the hosted API facade. The facade is down to 3,827 lines, and the beta release
  gate includes dedicated handler tests for profile reads/writes, onboarding
  loop seeding, demo records, and production demo-seed blocking.
- R2 now extracts hosted workspace config, onboarding state/completion, and
  founder approval-policy normalization into
  `api/lib/startup-office/workspaceConfigHandlers.js`. The facade is down to
  3,612 lines, and the release gate now tests workspace config snapshots,
  onboarding seeding, fallback detection, founder-control policy defaults, and
  company profile service normalization.
- R2 now extracts hosted auth session, login, profile update, and password-change
  behavior into `api/lib/hosted/authHandlers.js`. The facade is down to 3,545
  lines, and the release gate now tests authenticated/unauthenticated sessions,
  active-membership login, profile metadata writes, and current-password
  verification before credential updates.
- R2 now extracts the hosted workspace role and permission model into
  `api/lib/hosted/permissions.js`. The facade is down to 3,420 lines, and the
  release gate now tests role presets, allow/deny overrides, effective
  permissions, and typed permission/admin guards.
- R2 now extracts hosted team member listing, role updates, permission metadata,
  and permission override mutations into `api/lib/hosted/memberHandlers.js`.
  The facade is down to 3,241 lines, and the release gate now tests scoped auth
  user lookup, role-change audits, self-permission protection, and normalized
  permission patches.
- R2 now extracts hosted invite listing, creation, lookup, acceptance,
  one-time URL rendering, and token hashing into
  `api/lib/hosted/inviteHandlers.js`. The facade is down to 3,120 lines, and the
  release gate now tests hash-only invite persistence, one-time URL responses,
  pending-token lookup, same-workspace acceptance, and cross-workspace rejection.
- R2 now extracts hosted signup, confirmed Supabase session creation, duplicate
  account handling, invite-based workspace joining, and unique company
  workspace slug creation into `api/lib/hosted/signupHandlers.js`. The facade is
  down to 3,021 lines, and the release gate now tests new owner workspace
  creation, invite join acceptance, duplicate-account conflicts, provider
  session failures, and slug collision handling.
- R2 now extracts hosted channel, DM, message, and home-session behavior into
  `api/lib/hosted/conversationHandlers.js`. The facade is down to 2,811 lines,
  and the release gate now tests hosted channel shapes, DM channels, message
  filtering, normalized message writes, home-session summaries, deletion, and
  typed validation errors.
- The linked `laf-agents-office` Supabase project was repaired from legacy
  8-digit migration history into 14-digit Supabase versions, then pushed through
  the pure-cloud boundary guard. A linked DB query confirms
  the obsolete device, queue, execution-plan, checkout-binding, and claim-function
  objects are absent; the newest migration now fails if any of those objects or
  columns survive.
- R3 now removes remaining user-facing device/runtime reset copy from settings,
  onboarding, command fallback, status-bar connection state, and memory docs.
  The Supabase guard migration
  `20260525210000_assert_pure_cloud_boundary_schema.sql`
  was applied to the linked remote project and now purges/asserts retired local
  execution tables, columns, functions, policies, relation names, and types.
- R3 also removes the obsolete `web/e2e` harness that depended on the retired
  desktop binary and state files; the pure-cloud boundary gate now rejects that path
  if it returns.
- The retired external runtime connector has been removed from the hosted
  product surface. `npm run startup-office:surface` and
  `npm run startup-office:pure-cloud-boundary` now fail if those old product terms or
  paths return to tracked source.
- R3 now has a canonical current Supabase schema manifest at
  `supabase/schema/current.json`. `npm run startup-office:schema` parses the
  migration history, verifies the manifest's 30 active tables, columns, tenant
  columns, RLS coverage, latest migration, and pure-cloud guard migration, and
  the beta release gate now runs that check.
- R3 now proves the hosted API request-size boundary. `api/hosted-api.test.js`
  verifies oversized `Content-Length`, parsed JSON, and raw JSON payloads return
  413 before mutation handlers run; the beta release gate includes that test.
- R3 now rate-limits the full Startup Office mutating route contract at ingress.
  The hosted API guards export, loop runs, run retries/cancels, approval
  decisions, invite creation, profile/policy/billing writes, admin demo seed,
  support access, deletion requests, deletion purge, worker-job recovery, loop
  configuration, asset upload intents, artifact actions, and operating-object
  writes. `npm run startup-office:rate-limits` derives mutating route samples from
  `STARTUP_OFFICE_ROUTE_CONTRACTS` so new write routes cannot silently ship
  without an ingress bucket.
- R3/R8 now closes the workspace deletion contract. The deletion handler returns
  a manifest, records it on deletion requests, and exposes an explicit purge
  confirmation route. Supabase migration
  `20260526070000_add_startup_office_workspace_purge.sql` adds
  `startup_office_deletion_tombstones` plus the service-role-only
  `purge_startup_office_workspace` RPC, which sets
  `app.allow_receipt_delete=on` only for the transaction and deletes the
  workspace through `teams` cascade. `npm run startup-office:deletion-coverage`
  derives the required purge table list from `supabase/schema/current.json`.
- R3 now adds a Supabase-backed production limiter. The
  `hosted_rate_limits` table and `claim_hosted_rate_limit` RPC provide an
  atomic shared bucket for deployed API instances, while tests keep the local
  in-memory fallback covered.
- R3 now adds a service-role access allowlist. `rest(table)` and `rpc(name)`
  reject tables and functions that are not registered in
  `supabase/schema/current.json`, and the release gate checks the guard module.
- R3 now starts shared API validation. Startup Office loop creation and loop run
  payloads use `api/lib/startup-office/validation.js`, with release-gate tests
  for malformed object, policy, inputs, and defer fields.
- R3 now strengthens the idempotency contract. Loop run requests accept
  `Idempotency-Key` or `idempotency_key`, replay existing runs without duplicate
  worker jobs or receipts, run cancel/retry requests replay matching lifecycle
  mutations without duplicate receipts or worker jobs, approval decisions replay
  matching decided approvals, and the loop worker writes deterministic
  idempotency keys for artifacts and approvals. Supabase migration
  `20260525050000_startup_office_idempotency_keys.sql` adds non-empty unique
  indexes for runs, artifacts, and approvals, and the schema gate verifies those
  indexes.
- R5 now starts receipt immutability. Supabase migration
  `20260525060000_startup_office_receipt_append_only.sql` adds a database
  trigger that blocks receipt updates and requires
  `app.allow_receipt_delete=on` before receipt deletion; the schema gate verifies
  the append-only function, trigger, and bypass setting.
- R3/R7 now starts a durable outbox. Supabase migration
  `20260525070000_startup_office_outbox_events.sql` creates
  `startup_office_outbox_events` and DB triggers that enqueue outbox rows on
  notification, receipt, and usage-event inserts. Migration
  `20260525080000_secure_startup_office_outbox_function.sql` pins the trigger
  function as `SECURITY DEFINER` with `search_path=public`, and
  `20260525090000_correct_startup_office_outbox_notification_actor.sql` avoids
  mislabeling notification recipients as the outbox actor. The schema gate
  verifies the table, secure function, source branches, event prefixes, actor
  semantics, and triggers. The beta dashboard now exposes
  queued/failed/dead-letter outbox rows for operators.
- R7 now starts outbox delivery processing. Supabase migration
  `20260525100000_claim_startup_office_outbox_events.sql` adds an atomic
  service-role claim RPC with `FOR UPDATE SKIP LOCKED`, stale-lock recovery,
  and attempt increments. `workers/startup-office/outboxWorker.js` drains
  claimed rows, marks in-app notifications sent, retries with backoff, and
  dead-letters exhausted events; the beta release gate now runs its worker
  tests.
- R7 now adds a deploy-time email provider path. The outbox worker can use
  `LAF_OUTBOX_EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `LAF_EMAIL_FROM`, and
  `LAF_EMAIL_REPLY_TO` to send approval/failure emails through Resend, resolving
  recipient emails through Supabase Auth Admin. Tests cover email rendering,
  HTML escaping, Resend request shape, provider errors, and notification
  delivery metadata.
- R7/R8 now hardens deployment preflight. `npm run hosted-env:preflight`
  validates outbox email provider selection, Resend secrets, sender/reply-to
  email shapes, batch size, lock timeout, closed-beta billing mode, managed-model
  fallback flags, and Startup Office AI worker readiness without printing secret
  values. Production preflight now requires `LAF_OFFICE_BILLING_MODE=manual`,
  requires an OpenAI AI worker key, rejects `fake`/`disabled` providers outside
  local hosted rehearsals, and the beta release gate now runs the preflight test
  suite.
- R7/R8 now packages the outbox worker for independent operation.
  `.github/workflows/startup-office-outbox-worker.yml` runs every five minutes,
  preflights the same Supabase, public host, billing, AI worker, and outbox env
  contract as production, then drains a bounded outbox batch with
  `npm run startup-office:outbox-worker`. `docs/ops/STARTUP-OFFICE-DEPLOYMENT-RUNBOOK.md`
  documents deploy order, secrets, migrations, worker smoke, health monitoring,
  and rollback, and `npm run startup-office:worker-deploy` gates the workflow
  and runbook.
- R7/R8 now packages the AI loop worker for independent operation. Supabase
  migration `20260525110000_claim_startup_office_worker_jobs.sql` adds
  `available_at`, `dead_letter`, and the service-role
  `claim_startup_office_worker_job` lease RPC with stale-lock reclaim.
  `scripts/startup-office-loop-worker.cjs` processes queued loop jobs through
  the same idempotent loop engine, retries with backoff, and dead-letters
  exhausted jobs. `.github/workflows/startup-office-loop-worker.yml` runs the
  worker on schedule, and the release gate covers `loopWorker` tests plus the
  deploy/runbook checker.
- R7/R8 now adds worker job recovery APIs. Owner/admin operators can call
  `POST /api/startup-office/admin/worker-jobs/{job_id}/retry` to requeue
  failed, canceled, or dead-letter jobs after fixing provider/config issues, or
  `POST /api/startup-office/admin/worker-jobs/{job_id}/cancel` to close unsafe
  queued/running jobs. Both paths update associated unfinished runs and emit
  audit events.
- R7/R8 now adds scheduled queue monitoring. `.github/workflows/startup-office-ops-monitor.yml`
  runs every fifteen minutes, preflights production env, then fails on
  dead-letter outbox rows, dead-letter worker jobs, stale processing outbox
  rows, stuck worker jobs, failed run thresholds, and stale approval thresholds.
  The same monitor now fails on global model-spend thresholds, single-event cost
  spikes, and current-month workspace spend-ratio warnings, then prints
  aggregate run latency, approval wait, model token and cost, and worker
  duration metrics without exposing row payloads, provider responses, workspace
  IDs, or user data.
  `npm run startup-office:ops-monitor:test` is part of the release gate, and
  the deployment runbook documents monitor thresholds and incident handling.
- R7 now adds browser error collection. Browser-side errors now become
  workspace-scoped client.error_reported audit events through
  `POST /api/client-errors`, with client and server redaction for emails, URLs,
  query/hash tokens, unsafe route segments, and raw stack traces. The release
  gate includes both the hosted handler test and the browser telemetry test.
- R7 now adds a deployed synthetic monitor. The scheduled workflow runs
  `npm run startup-office:synthetic-monitor` with external synthetic account
  secrets and proves health, login, authenticated session, Growth Center/profile
  read, live loop execution, approval, receipt, and logout against the
  production API. The release gate checks the monitor contract and unit tests
  without requiring external credentials.
- R7 now adds an admin support timeline. `GET /startup-office/admin/support-timeline`
  composes audit events, runs, worker jobs, approvals, receipts, notifications,
  outbox state, and client-error audit events into one workspace-scoped sequence
  so operators can follow a customer report from user action to model output and
  recovery state.
- R8 now adds commercial billing documents. `startup_office_billing_documents`
  stores signed agreements, invoices, payment receipts, and plan changes; billing
  updates reject paid beta state without signed agreement, paid invoice, or
  payment reference evidence, and the beta ops UI exposes commercial status,
  entitlements, next action, and recent billing documents to the customer.
- R8 now adds activation analytics. `startup_office_activation_events` records
  first loop, first approval decision, second loop, and first export milestones
  idempotently from workflow/export paths, and the beta ops UI shows activation
  progress plus the next milestone for customer success review.
- R8 now adds support playbooks. The admin beta dashboard returns
  `support_playbooks` for failed run recovery, confused approval rescue,
  notification delivery recovery, billing block rescue, and clean
  customer-success review, with matching operator scripts in the launch kit.
- R3/R8 now adds the Startup Office security gate. `npm run startup-office:security`
  runs a full tracked-file `secretlint` scan, root/web `bun audit` checks for
  high or critical dependency advisories, hosted-runtime boundary checks,
  Supabase schema checks, and service-role allowlist tests; the beta release
  gate now includes this command. Root `fast-uri` and web `ws` are pinned to
  patched versions through package overrides.
- R3/R8 now unifies workspace permission definitions. The shared catalog
  `shared/workspace-permissions.json` drives the hosted API permission module
  and the generated web type artifact `web/src/api/workspacePermissions.ts`;
  `npm run startup-office:permissions` verifies role presets, unknown
  permissions, API constants, web artifact drift, and release-gate wiring. The
  old phantom viewer receipt permission was removed from effective permissions.
- R3/R8 now adds a declarative Startup Office authorization registry.
  `api/lib/startup-office/authorization.js` maps each route method to a known
  workspace permission or an explicit owner/admin policy. The dispatcher now
  executes that declared access contract before Startup Office handlers run,
  `requireUser` caches the request auth context to avoid duplicate auth lookups,
  and `npm run startup-office:authorization` fails if any route method is
  missing, uses an unknown permission, or mutates state with read-only access.
- R3/R8 now closes the Startup Office operating-object DELETE contract gap.
  `PATCH` and `DELETE /api/startup-office/{assets,customers,metrics,signals}/{id}`
  both execute within the caller workspace, require draft-memory permission,
  and emit structured audit events; the release gate covers the delete path in
  `api/lib/startup-office/objectHandlers.test.js`.
- R3/R8 now turns core Startup Office write auditing into an executable
  invariant. Run retries emit `startup_office.run_retry_queued`, artifact-to-asset
  and artifact-to-signal paths assert their audit events in tests, and
  `npm run startup-office:audit-coverage` maps every mutating Startup Office
  route to expected audit actions inside the beta release gate.
- R3/R8 now hardens founder workspace configuration writes. `POST /api/config`
  and `POST /api/onboarding/complete` require `workspace:manage`, the config
  write emits `workspace_config.updated`, and both routes are covered by hosted
  action rate limits before auth or database work.
- R2/R8 now extracts hosted audit-event reads into
  `api/lib/hosted/auditHandlers.js`. The hosted API facade no longer owns audit
  pagination/cursor serialization, `api/lib/hosted/auditHandlers.test.js` covers
  the `audit:read` permission and ISO cursor handling, and the architecture gate
  prevents the handler from drifting back into `api/[...path].js`.
- R2/R8 now extracts hosted model-access policy into
  `api/lib/hosted/modelAccess.js`. Managed-model availability, billing fallback,
  `model:use_laf` enforcement, the `model/availability` route, and model-mode
  normalization are covered by dedicated tests and prevented from moving back
  into the hosted API facade by the architecture gate.
- R2/R6 now extracts the hosted slash-command registry and command-run guard into
  `api/lib/hosted/commandHandlers.js`. The web command surface is tested outside
  the API facade, and the architecture gate prevents command registry constants,
  parser logic, or command execution stubs from drifting back into
  `api/[...path].js`.
- R2/R6 now extracts hosted roster identity surfaces into
  `api/lib/hosted/rosterHandlers.js`. Human identity, team identity, office
  member listing/creation, generated member templates, and channel member
  payloads are covered by dedicated tests and guarded against drifting back into
  the hosted API facade.
- R5/R6 now replaces the hosted `/memory` stub with a Startup Office memory
  adapter in `api/lib/hosted/memoryHandlers.js`. Human `/remember` notes now
  upsert approved `startup_office_memory_pages`, reads return namespace maps plus
  memory pages, writes require `memory:write_draft`, and `memory.note_saved`
  audit coverage is checked by the release gate.
- R5/R8 now replaces the hosted `/usage` zero stub with
  `api/lib/hosted/usageHandlers.js`. Usage totals, token counts, model-spend
  percent, run count, plan, and billing state now come from the Startup Office
  billing/usage snapshot and are covered by the beta release gate.
- R5/R8 now replaces the hosted `/agent-logs` empty stub with
  `api/lib/hosted/agentLogHandlers.js` for compatibility, while the primary
  Receipts app reads `/startup-office/receipts` directly, opens run detail
  receipts through `/startup-office/runs/:id`, and displays trace cost/tokens
  without depending on the legacy agent-log contract.
- R5/R8 now replaces the hosted `/requests` empty stub and `/requests/answer`
  no-op with `api/lib/hosted/requestHandlers.js`. The Requests app and global
  request overlay now read Startup Office approvals and delegate answers to the
  same approval action workflow used by the Approval Desk.
- R5/R8 now replaces the hosted `/scheduler` empty stub with
  `api/lib/hosted/schedulerHandlers.js`. The activity surface now reads
  `startup_office_worker_jobs`, maps due/running jobs into the existing
  SchedulerJob contract, and keeps due-only filtering deterministic in tests.
- R5/R8 now replaces the hosted `/actions`, `/signals`, `/decisions`, and
  `/watchdogs` empty stubs with `api/lib/hosted/activityHandlers.js`. The
  legacy activity dashboard surface now reads Startup Office receipts, signals,
  approval decisions, failed runs, and failed worker jobs instead of returning
  placeholder arrays.
- R5/R8 now replaces the hosted `/messages/react` no-op with a persisted
  reaction toggle in `api/lib/hosted/conversationHandlers.js`. Migration
  `20260525140000_channel_message_reactions.sql` adds explicit
  `channel_messages.reactions` storage, and migration
  `20260525150000_channel_message_reaction_rpc.sql` moves toggles into a
  row-locking internal RPC so concurrent reactions do not overwrite each other.
  The release gate now blocks this route from drifting back to `{ ok: true }`.
- R2/R8 now removes the remaining user-facing Tasks/Projects app entrypoint
  from the workspace shell. Retired project/task hash routes are no longer
  special-cased, `TasksApp` is no longer lazy-loaded or preloaded, and the
  surface gate blocks the legacy project/task app from returning to primary
  navigation.
- R2/R5/R8 now fully removes the legacy project/task workspace model instead
  of leaving compatibility handlers behind. The hosted `/projects`, `/tasks`,
  and `/projects/repo-readiness` routes now fall through as missing routes,
  `TasksApp`, `TaskDetailModal`, project/task client helpers, Home project
  hashtags, and task command entrypoints are gone, and migration
  `20260525160000_retire_project_task_workspace.sql` removes `projects`,
  `tasks`, `delivery_receipts`, plus project/task foreign-key columns from
  `channel_messages`, `wiki_article_index`, and `wiki_write_requests`. The
  linked Supabase project has that migration applied.
- R3/R5 now makes the first-party asset library lifecycle explicit. Assets can
  be listed, created, updated, linked to a run, saved from artifacts, and
  archived through `startup_office_assets.status`; migration
  `20260525170000_add_startup_office_asset_status.sql` adds the active/archive
  state and the release gate checks the schema manifest plus object handler
  coverage.
- R3/R5 now makes the customer CRM loop-aware. Customer records can be created,
  listed, status-filtered, updated, archived, and linked to discovery loops
  through `startup_office_customers.loop_id`; migration
  `20260525180000_add_startup_office_customer_loop_links.sql` adds the loop
  reference and index, and the release gate checks both the generic object
  handlers and hosted schema contract.
- R3/R5 now makes metric ingestion visible in the operating surface. Metrics
  can be recorded through `startup_office_metrics`, safely updated through
  `updated_at`, and summarized in Growth Center as latest/previous/change rows;
  migration `20260525190000_add_startup_office_metric_updated_at.sql` keeps the
  schema aligned with the object update path and the release gate covers the
  summary contract.
- R3/R5 now classifies captured signals as market, customer, competitor, or
  internal evidence. Signals can be filtered by type, triaged through the
  operating-object API, and linked back to loops/runs so research and artifact
  evidence can be reused without any local execution surface.
- R5 now materializes founder company-profile edits into the canonical
  `company-profile` memory page. The page stores a markdown snapshot plus
  changed fields, actor, timestamp, source metadata, and verification time, so
  profile state becomes reusable company memory instead of UI-only settings.
- R5 now materializes approved loop receipts into canonical memory pages.
  Completed approvals append structured entries to `loop-receipts` and
  learning summaries to `learning-updates`, with receipt/run/approval
  provenance and release-gate coverage.
- R4/R5 now records loop skill invocation manifests. Each run carries selected
  skill names, sequence, reasons, input keys, and input snapshots in run/job
  metadata plus run receipts, artifacts, and approvals so receipts can replay
  which business playbooks were used and why.
- R3/R8 now applies Supabase migration
  `20260525210000_assert_pure_cloud_boundary_schema.sql` to the linked remote
  project. It purges retired customer-managed execution residue across columns,
  constraints, functions, policies, relations, triggers, and types, then fails
  closed if any residue remains. The schema manifest and release gate now treat
  this migration as the canonical pure-cloud guard.
- R3 now upgrades the live RLS verifier from representative checks to a
  schema-drift-resistant table matrix. `scripts/verify-startup-office-rls-postgrest.cjs`
  seeds Alpha/Beta fixtures for every Startup Office team table and the
  workspace billing/settings/audit tables that gate the product, then verifies
  anon, authenticated, cross-tenant, and service-role paths through PostgREST.
- R3 now extends that live verifier from read isolation to write isolation.
  Alpha tokens attempt beta-team inserts and beta-team updates across writable
  Startup Office tables, while direct client writes to service-owned audit,
  usage, notification, outbox, billing-document, and activation tables must be
  rejected by RLS.
