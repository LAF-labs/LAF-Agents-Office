# Closed Beta 100 Goals

This roadmap is the operating contract for turning LAF into a pure-cloud AI
Startup Office: one account owns one company workspace, founders control every
important action, and the product sells outcomes rather than developer-local
tooling.

Completion rule: a goal is `Complete` only when there is concrete repository
evidence in code, schema, tests, or docs. A written requirement alone does not
make a product goal complete.

Status values: `Complete`, `In progress`, `Not started`, `Blocked`.

| ID | Status | Goal | Exit criterion | Evidence |
| --- | --- | --- | --- | --- |
| G001 | Complete | Define the pure-cloud Startup Office pivot thesis. | Product narrative clearly rejects local work as the main wedge. | `docs/specs/PURE-CLOUD-STARTUP-OFFICE-PIVOT.md` |
| G002 | Complete | Define the safer and more transparent Polsia positioning. | Founder-control, receipts, and transparency are explicit product pillars. | `docs/specs/AUTONOMOUS-COMPANY-OS.md` |
| G003 | Complete | Define one account as one company workspace. | Workspace model is documented around company identity and team membership. | `docs/specs/AUTONOMOUS-COMPANY-OS.md` |
| G004 | Complete | Preserve the existing skills, wiki, and Growth Center bones. | Product plan maps skills, wiki, Growth Center, approvals, and receipts together. | `docs/specs/AUTONOMOUS-COMPANY-OS.md` |
| G005 | Complete | Remove Projects and Tasks from the primary app shell. | Startup Office surface guard checks navigation no longer exposes them. | `scripts/check-startup-office-surface.cjs` |
| G006 | Complete | Make Growth Center the default authenticated route. | Router test and surface guard enforce Growth Center as first app. | `web/src/hooks/useHashRouter.test.ts` |
| G007 | Complete | Reframe onboarding as company setup. | Onboarding copy creates a company workspace for memory, approvals, assets, and loops. | `web/src/components/onboarding/Wizard.tsx` |
| G008 | Complete | Hide local Bridge setup from hosted settings. | Startup Office surface guard blocks Bridge copy in primary hosted surface. | `scripts/check-startup-office-surface.cjs` |
| G009 | Complete | Add visible Growth Center launch loops. | UI renders launch loops, approval desk, pulse, and receipts. | `web/src/components/apps/SkillsApp.tsx` |
| G010 | Complete | Add a Startup Office surface regression check. | Root script fails on project, task, Bridge, or GitHub copy in primary surface. | `package.json`, `scripts/check-startup-office-surface.cjs` |
| G011 | Complete | Keep hosted auth and session foundation working. | Hosted API auth/session tests still pass. | `api/hosted-api.test.js` |
| G012 | Complete | Keep team invite and membership foundation working. | Existing invite and membership handlers remain available for Notion-like workspaces. | `api/[...path].js` |
| G013 | Complete | Add company profile database schema. | Supabase migration creates `company_profiles` with RLS. | `supabase/migrations/20260524000000_startup_office_domain.sql` |
| G014 | Complete | Add operating loop database schema. | Migration creates `startup_office_loops` with unique workspace slug and RLS. | `supabase/migrations/20260524000000_startup_office_domain.sql` |
| G015 | Complete | Add run database schema. | Migration creates `startup_office_runs` with cloud run statuses and RLS. | `supabase/migrations/20260524000000_startup_office_domain.sql` |
| G016 | Complete | Add artifact database schema. | Migration creates `startup_office_artifacts` for drafts, plans, assets, wiki updates, reports, and messages. | `supabase/migrations/20260524000000_startup_office_domain.sql` |
| G017 | Complete | Add approval database schema. | Migration creates `startup_office_approvals` with risk level, decision fields, and RLS. | `supabase/migrations/20260524000000_startup_office_domain.sql` |
| G018 | Complete | Add receipt database schema. | Migration creates `startup_office_receipts` with trace metadata and RLS. | `supabase/migrations/20260524000000_startup_office_domain.sql` |
| G019 | Complete | Add beta asset, customer, metric, and signal schemas. | Migration creates first-party business tables for beta operations. | `supabase/migrations/20260524000000_startup_office_domain.sql` |
| G020 | Complete | Add RLS policies for Startup Office tables. | Members can read scoped company records and writes are scoped by role or membership. | `supabase/migrations/20260524000000_startup_office_domain.sql` |
| G021 | Complete | Add company profile API. | `GET` and `PATCH /company/profile` persist company-first profile data. | `api/[...path].js`, `api/hosted-api.test.js` |
| G022 | Complete | Add operating loops API. | `GET` and `POST /startup-office/loops` work against Startup Office tables. | `api/[...path].js`, `api/hosted-api.test.js` |
| G023 | Complete | Add loop run creation API. | `POST /startup-office/loops/:id/run` creates run, artifact, approval, and receipt. | `api/[...path].js`, `api/hosted-api.test.js` |
| G024 | Complete | Add approval queue API. | `GET /startup-office/approvals` returns pending and decided approval records. | `api/[...path].js`, `api/hosted-api.test.js` |
| G025 | Complete | Add approval decision API. | `POST /startup-office/approvals/:id/approve` completes a run and writes a receipt. | `api/[...path].js`, `api/hosted-api.test.js` |
| G026 | Complete | Add receipts API. | `GET /startup-office/receipts` returns run receipts. | `api/[...path].js`, `api/hosted-api.test.js` |
| G027 | Complete | Add Growth Center summary API. | `GET /startup-office/growth-summary` returns profile, loops, runs, approvals, receipts, and pulse counts. | `api/[...path].js`, `api/hosted-api.test.js` |
| G028 | Complete | Stop onboarding from seeding projects and tasks. | Hosted onboarding seeds Startup Office loops and receipt instead of project/task records. | `api/[...path].js`, `api/hosted-api.test.js` |
| G029 | Complete | Remove task and provider slash commands from hosted autocomplete. | Hosted command registry exposes growth, loops, approvals, receipts and hides task/provider commands. | `api/[...path].js`, `api/hosted-api.test.js`, `web/src/hooks/useCommands.ts` |
| G030 | Complete | Add backend regression coverage for Startup Office core flow. | Node test covers profile patch, loop run, approval, receipt, and growth summary. | `api/hosted-api.test.js` |
| G031 | Complete | Keep legacy hosted API tests passing after backend pivot. | Full `node --test api/hosted-api.test.js` passes. | local verification |
| G032 | Complete | Define exactly 100 closed-beta readiness goals. | This document has unique sequential goals from G001 to G100. | `docs/specs/CLOSED-BETA-100-GOALS.md` |
| G033 | Complete | Add a machine check for the 100-goal roadmap. | Script validates count, IDs, statuses, and non-empty evidence for completed goals. | `scripts/check-closed-beta-goals.cjs` |
| G034 | Complete | Implement frontend data fetching for Growth Center summary. | Startup Office reads live `/startup-office/growth-summary` data with static fallback. | `web/src/components/apps/SkillsApp.tsx`, `web/src/api/client.ts`, `web/src/components/apps/SkillsApp.test.tsx` |
| G035 | Not started | Implement frontend company profile editor. | Founder can edit ICP, offer, positioning, stage, and priority from hosted UI. | pending |
| G036 | Complete | Implement frontend loop run button. | Founder can start a beta loop from Startup Office and refresh the run/approval/receipt state. | `web/src/components/apps/SkillsApp.tsx`, `web/src/components/apps/SkillsApp.test.tsx` |
| G037 | Complete | Implement frontend approval queue. | Founder can approve or reject pending actions from the Startup Office Approval Desk. | `web/src/components/apps/SkillsApp.tsx`, `web/src/components/apps/SkillsApp.test.tsx` |
| G038 | Not started | Implement frontend receipt timeline. | Receipts app reads Startup Office receipts instead of legacy agent logs only. | pending |
| G039 | Not started | Implement run detail view. | Founder can inspect objective, inputs, draft artifact, approval, and receipt trace for a run. | pending |
| G040 | Not started | Implement artifact viewer. | Drafts, reports, messages, and wiki updates render with copy and export actions. | pending |
| G041 | Not started | Implement asset library backend endpoints. | Assets can be created, listed, updated, archived, and linked to runs. | pending |
| G042 | Not started | Implement customer CRM backend endpoints. | Leads and customers can be created, updated, filtered, and linked to discovery loops. | pending |
| G043 | Not started | Implement metric ingestion endpoints. | Company metrics can be recorded and summarized by Growth Center. | pending |
| G044 | Not started | Implement signal capture endpoints. | Market, customer, and competitor signals can be captured, triaged, and reused. | pending |
| G045 | Not started | Implement wiki materialization for company profile. | Profile edits update a canonical wiki page and keep provenance. | pending |
| G046 | Not started | Implement wiki materialization for loop receipts. | Completed runs write structured wiki entries and learning updates. | pending |
| G047 | Not started | Implement skill invocation records for loops. | Each loop run records which skills were selected, why, and with what inputs. | pending |
| G048 | Not started | Implement a cloud worker for loop execution. | Runs can progress beyond record-only drafts through a server-side worker. | pending |
| G049 | Not started | Implement model provider abstraction for cloud execution. | Backend can call configured LLM providers without local Bridge or local CLIs. | pending |
| G050 | Not started | Implement prompt templates for Idea Validation. | Idea Validation loop produces sourced ICP, assumptions, risks, and next evidence. | pending |
| G051 | Not started | Implement prompt templates for Offer Package. | Offer Package loop produces offer, pricing hypothesis, objections, and sales copy. | pending |
| G052 | Not started | Implement prompt templates for Customer Discovery. | Discovery loop produces target list criteria, interview guide, and follow-up drafts. | pending |
| G053 | Not started | Implement prompt templates for Launch Campaign. | Campaign loop produces channel plan, copy variants, approvals, and metrics. | pending |
| G054 | Not started | Implement prompt templates for Weekly Operator Review. | Weekly review summarizes company pulse, decisions, risks, next loops, and receipts. | pending |
| G055 | Not started | Add source citation requirements to every externally informed loop. | Runs cannot complete research outputs without attached source metadata. | pending |
| G056 | Not started | Add browser research tool integration for cloud workers. | Worker can gather web evidence under policy and record sources in artifacts. | pending |
| G057 | Not started | Add human approval gates for public or customer-facing actions. | External-send, publish, payment, and legal-sensitive actions always require approval. | pending |
| G058 | Not started | Add approval revision flow. | Founder can request revision and the run returns to worker with structured notes. | pending |
| G059 | Not started | Add approval policy configuration. | Workspace owners can set which actions require approval and which are auto-draft only. | pending |
| G060 | Not started | Add audit log coverage for every Startup Office write. | Profile, loops, runs, artifacts, approvals, receipts, assets, customers, metrics, and signals emit audit events. | pending |
| G061 | Not started | Add rate limits for loop runs and approval actions. | Abuse and accidental repeated submissions are bounded per workspace and user. | pending |
| G062 | Not started | Add idempotency keys for loop run creation. | Retried browser requests do not create duplicate runs. | pending |
| G063 | Not started | Add request body size checks for artifacts and assets. | Large user or model payloads are bounded before database writes. | pending |
| G064 | Not started | Add tenant isolation integration tests. | API tests prove one workspace cannot read or write another workspace's Startup Office records. | pending |
| G065 | Not started | Add role-specific authorization tests. | Viewer, member, manager, admin, and owner capabilities are covered for Startup Office routes. | pending |
| G066 | Not started | Add RLS verification against a real Supabase test database. | Migration policies are exercised against PostgREST with anon and service roles. | pending |
| G067 | Not started | Add migration rollback or forward-fix runbook. | Operators know how to recover if the Startup Office migration fails. | pending |
| G068 | Not started | Add production environment preflight for pure cloud mode. | Release gate checks LLM keys, Supabase, CORS, worker secrets, billing, and public URL config. | pending |
| G069 | Not started | Add cloud worker deployment config. | Worker can run in the chosen deployment environment with logs and health checks. | pending |
| G070 | Not started | Add observability for runs and worker jobs. | Logs, metrics, and traces expose run latency, failures, approval waits, and model costs. | pending |
| G071 | Not started | Add cost metering per workspace. | Token usage, tool calls, and run costs are attributed to company workspace. | pending |
| G072 | Not started | Add plan limits for closed beta. | Beta workspaces have enforceable limits for seats, runs, storage, and monthly spend. | pending |
| G073 | Not started | Add Stripe or manual billing state. | Closed beta operators can mark paid, trial, paused, or blocked workspaces. | pending |
| G074 | Not started | Add admin beta operations dashboard. | Operators can see beta workspaces, status, usage, failures, and support notes. | pending |
| G075 | Not started | Add support impersonation policy without silent access. | Any support access is explicit, logged, and visible to workspace owners. | pending |
| G076 | Not started | Add data export for company memory. | Founder can export company profile, wiki, assets, customers, metrics, runs, approvals, and receipts. | pending |
| G077 | Not started | Add workspace deletion flow. | Owner can request deletion and all Startup Office records are removed or queued for deletion. | pending |
| G078 | Not started | Add privacy and data processing terms. | Beta sale includes clear data handling, model usage, retention, and deletion language. | pending |
| G079 | Not started | Add safety disclaimer boundaries. | Product copy clarifies that legal, financial, medical, and regulated advice needs expert review. | pending |
| G080 | Not started | Add competitor comparison sales page. | Public positioning explains safer, transparent founder-controlled alternative to direct competitors. | pending |
| G081 | Not started | Add beta onboarding email sequence. | New beta founders receive setup, first loop, approval, and support guidance. | pending |
| G082 | Not started | Add founder demo workspace seed. | Sales demos can create a realistic workspace with sample profile, loops, approvals, assets, and receipts. | pending |
| G083 | Not started | Add closed beta acceptance criteria. | Team has a written threshold for who gets invited and when a workspace is ready. | pending |
| G084 | Not started | Add founder success checklist. | Operators can verify that a beta founder completed profile, first run, first approval, and receipt review. | pending |
| G085 | Not started | Add support playbook for failed runs. | Operators can triage stuck runs, failed model calls, bad drafts, and approval confusion. | pending |
| G086 | Not started | Add incident response runbook. | Operators know what to do for data leaks, cross-tenant bugs, billing abuse, and worker outages. | pending |
| G087 | Not started | Add backup and restore verification. | Supabase backups and restore drill cover new Startup Office tables. | pending |
| G088 | Not started | Add seed data reset for internal testing. | Developers and operators can reset demo workspaces without destructive production commands. | pending |
| G089 | Not started | Add Playwright smoke test for first beta flow. | Browser test covers signup, company profile, first loop, approval, receipt, and logout. | pending |
| G090 | Not started | Add accessibility pass for Growth Center and approvals. | Keyboard, focus, labels, contrast, and responsive behavior are verified. | pending |
| G091 | Not started | Add mobile viewport QA. | Founder can review and approve runs on mobile without layout breakage. | pending |
| G092 | Not started | Add localized Korean copy for the beta flow. | Core onboarding, Growth Center, approvals, and receipts work in Korean and English. | pending |
| G093 | Not started | Add transactional email for invites and approval notifications. | Team invites and pending approvals can notify users outside the app. | pending |
| G094 | Not started | Add workspace activity notifications. | Founder sees recent run changes, failures, approvals, and receipts on login. | pending |
| G095 | Not started | Add secure file upload for assets. | Founder can upload business materials used by loops with size and content-type controls. | pending |
| G096 | Not started | Add retrieval over wiki and assets. | Cloud worker can ground loop outputs in company memory and uploaded materials. | pending |
| G097 | Not started | Add quality evaluation harness for loop outputs. | Sample prompts and expected rubric catch low-quality, unsafe, or unsourced outputs. | pending |
| G098 | Not started | Add beta release gate script. | One command verifies docs, API tests, web tests, surface checks, env preflight, and smoke tests. | pending |
| G099 | Not started | Complete production deployment and DNS. | Closed beta app is deployed on the production domain with working Supabase and worker environment. | pending |
| G100 | Not started | Sell the first closed beta workspace. | A real founder pays or signs an explicit beta agreement and runs the first approved loop. | pending |

## Current Readiness

Backend foundation is started but the product is not yet launch-ready. The
repository now has the cloud-domain schema and hosted API primitives required
for a controlled beta flow, but the frontend still needs to consume the new
endpoints and a real cloud worker must execute loops beyond record-only drafts.
