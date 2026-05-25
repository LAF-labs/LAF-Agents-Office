# Autonomous Company OS

Status: single-source product and engineering spec for the pure-cloud Startup
Office pivot

## 0. Executive Decision

Build LAF as a pure-cloud, Notion-style AI Startup Office:

> A safer, more transparent Polsia where the founder stays in control.

LAF is not a developer workspace, project manager, task board, local execution setup, or
coding agent wrapper. LAF is a company operating system for non-technical
founders who want an AI staff to validate, launch, market, operate, and learn
inside one controlled workspace.

The existing LAF strengths to preserve are:

- Skills: reusable operating procedures that agents can invoke and improve.
- Wiki: durable, source-backed company memory with facts, insights, playbooks,
  lint, provenance, and review.
- Growth Center: the new primary command center for loops, runs, approvals,
  signals, assets, metrics, and learned updates.
- Notion-style workspace model: accounts are people; workspaces are company
  operating spaces; teammates join workspaces.

The old project/task workflow is removed from the primary product. It can remain
as legacy code during migration, but it must not define the new user experience.

## 1. Sources Reviewed

### Internal Repo

- `docs/specs/PURE-CLOUD-STARTUP-OFFICE-PIVOT.md`
- `docs/specs/WIKI-SCHEMA.md`
- `docs/specs/AGENT-MEMORY-PACKETS.md`
- `docs/specs/memory-superworkflow.md`
- `web/src/components/apps/SkillsApp.tsx`
- `web/src/components/apps/SkillsApp.test.tsx`
- `web/src/components/review/ReviewQueueKanban.tsx`
- `web/src/components/apps/TasksApp.tsx`
- `internal/teammcp/skills.go`
- `DESIGN.md`
- `assets/hero.png`, `website/og-image.png`, `brand/*`

Current screenshots/assets are mostly brand or legacy workspace assets. They do
not define the new product surface. The new surface should reuse the app shell,
Notion-like density, Growth Center mechanics, wiki components, review mechanics,
and skills plumbing.

### External Market Sources

- Polsia Product Hunt:
  https://www.producthunt.com/products/polsia
- Polsia Terms:
  https://www.polsia.ai/terms
- Polsia review:
  https://crevio.co/blog/is-polsia-legit
- Trustpilot review page:
  https://www.trustpilot.com/review/polsia.com
- NanoCorp alternative signal:
  https://www.nanocorp.so/
- Zapier Agents:
  https://help.zapier.com/hc/en-us/articles/24393442652557-Build-an-agent-in-Zapier-Agents
- Gumloop docs:
  https://docs.gumloop.com/
- Lindy docs:
  https://docs.lindy.ai/index
- Relevance AI:
  https://relevanceai.com/about-us
- HubSpot Breeze:
  https://knowledge.hubspot.com/ai/understand-breeze
- Salesforce Agentforce:
  https://investor.salesforce.com/news/news-details/2025/Salesforce-Launches-Agentforce-2dx-with-New-Capabilities-to-Embed-Proactive-Agentic-AI-into-Any-Workflow-Create-Multimodal-Experiences-and-Extend-Digital-Labor-Throughout-the-Enterprise/default.aspx
- Microsoft Copilot Studio updates:
  https://www.microsoft.com/en-us/microsoft-copilot/blog/copilot-studio/new-and-improved-agent-governance-intelligent-workflows-and-connected-app-experiences/
- OpenAI Agents SDK guardrails and tracing:
  https://openai.github.io/openai-agents-js/guides/guardrails
  https://openai.github.io/openai-agents-js/guides/tracing/
- Notion workspace roles:
  https://www.notion.com/help/whos-who-in-a-workspace
- Notion create/join/switch workspaces:
  https://www.notion.com/en-gb/help/create-delete-and-switch-workspaces
- Zapier 2026 AI agent builder overview:
  https://zapier.com/blog/best-ai-agent-builder/
- Gumloop funding and category signal:
  https://techcrunch.com/2026/03/12/gumloop-lands-50m-from-benchmark-to-turn-every-employee-into-an-ai-agent-builder/
- Digital Co-Founders research:
  https://arxiv.org/abs/2511.09533
- Generative AI and solo entrepreneurship research:
  https://arxiv.org/abs/2605.10291

## 2. Market Lessons

### 2.1 Polsia Validates The Category

Polsia proves that the pitch "AI runs your company" is legible. Public copy and
Product Hunt positioning emphasize planning, coding, marketing, operations,
daily cycles, and no employees. The product is bold enough to make founders pay
attention.

Lesson for LAF:

- The category is real.
- The promise should be company operation, not agent tooling.
- The product must show visible company progress, not generic chat.

### 2.2 Polsia Also Exposes The Trust Problem

Polsia's terms show a large risk surface:

- Scheduled autonomous operations.
- Outbound email.
- Advertising spend.
- Platform-managed ad accounts.
- Infrastructure provisioning.
- Browser automation.
- Off-session billing for usage.
- AI-generated public content.

Product Hunt comments and independent reviews expose founder anxieties:

- Where can I see what the AI is doing?
- How do I stay in control?
- What if the AI makes a customer promise?
- What if it spends money?
- What if credits burn without useful output?
- How do I understand pricing and revenue share?
- What is real versus projection?
- How do I export or recover my data?

Lesson for LAF:

- Founder control is the product.
- Receipts, approvals, and provenance are not enterprise features; they are core
  UX.
- Never hide risky actions behind "autonomy."
- Make projected, drafted, approved, and executed states visually distinct.

### 2.3 Automation Builders Are Not The Same Product

Zapier Agents, Gumloop, Lindy, and Relevance AI prove demand for AI automation
and AI workforces. They mostly assume the user wants to build or wire workflows.
That is not LAF's wedge.

Lesson for LAF:

- Do not start as a workflow builder.
- Do not make external integrations the hero.
- Use first-party business modules and plain operating loops.
- Let agents use internal objects first: wiki, customers, assets, campaigns,
  approvals, metrics, skills.

### 2.4 Enterprise Agent Platforms Prove Governance Matters

Salesforce, HubSpot, Microsoft, and OpenAI all emphasize agent governance,
guardrails, traces, workflows, permissions, and business context.

Lesson for LAF:

- Founder-grade products need enterprise-grade control primitives in a simpler
  UI.
- Every run needs trace, source, tool use, approval, cost, and receipt metadata.
- Guardrails must be policy objects, not hidden prompts.

### 2.5 Notion Provides The Right Collaboration Model

Notion separates accounts, workspaces, members, guests, roles, and workspace
switching. LAF should adopt the simple version:

- Account equals person.
- Workspace equals company operating space.
- Each account gets one default workspace.
- Workspaces can invite teammates.
- Users can belong to multiple workspaces.

### 2.6 The Buying Window Is Real, But The Winning Product Is Narrow

The 2026 market is crowded with agent builders, workflow builders, and
enterprise agent platforms. That is a positive signal, not a reason to copy
them. The buyer already understands that AI agents can do business work. The
unresolved question is whether a founder can trust one workspace to run the
business without hidden spend, opaque automation, or fragile integrations.

LAF should not sell "build any agent." That market is noisy and favors Zapier,
Gumloop, Lindy, Relevance AI, n8n, and enterprise suites. LAF should sell a
specific first outcome:

> Turn a business idea into a controlled operating workspace that produces
> weekly evidence, approved assets, customer records, and reusable procedures.

This is a narrower promise than Polsia and easier to make credible. Polsia
creates demand by promising autonomous company creation. LAF converts that
demand by making the founder comfortable enough to pay: every action is visible,
drafted, approved, receipted, and exportable.

### 2.7 The Sellable Wedge

The first product sold should be a founder-controlled launch office, not a
general company replacement.

Initial paid promise:

> In 7 days, LAF will help you clarify an offer, create a landing page draft,
> define your first 100 customer plan, produce outreach/content assets, record
> the evidence, and hand you a weekly operating review. Nothing public or
> financial happens without approval.

The founder pays because LAF removes the most painful early-stage bottleneck:
turning scattered founder intent into visible market-facing work while keeping
control. This is stronger than "AI staff" alone because it gives a concrete
purchase moment and a visible before/after.

Do not sell to founders who only want code generation. Sell to founders who
need a business operating cadence and do not have a marketing, research, sales,
support, and operations team.

## 3. Positioning

Primary sentence:

> LAF is a pure-cloud AI Startup Office that lets a founder run a company with
> AI departments, while every action remains visible, reviewable, and under the
> founder's control.

Short version:

> Founder-controlled AI company operations.

Competitive anchor:

> Safer, more transparent Polsia.

What LAF is:

- AI Startup Office.
- Company operating system.
- Founder control plane.
- Growth and business execution workspace.
- Company memory plus AI staff.

What LAF is not:

- Not a coding IDE.
- Not a local agent runtime.
- Not a repo task board.
- Not a Zapier clone.
- Not a generic AI chatbot.
- Not a silent autonomous company with no audit trail.

## 4. Target Customer

Primary customer:

- Non-technical founder with a business idea.
- Solo founder without a team.
- Small business owner who wants AI staff.
- Creator or consultant turning expertise into products.
- Operator who wants growth, marketing, sales, support, and planning in one
  place.

Secondary customer:

- Technical founder who already uses Claude Code, Codex, Cursor, or Copilot for
  coding, but wants LAF to operate the business side.

Do not optimize the MVP for professional developers. They already have their
tools.

### 4.1 First ICP

The first ICP is deliberately narrow:

- Solo or two-person founder.
- Has an idea, prototype, audience, consulting offer, paid community, digital
  product, agency offer, or local business service.
- Can pay at least USD 49-199/month or a higher concierge setup fee.
- Does not have a full-time growth/operator team.
- Wants momentum but is afraid of unreviewed AI autonomy.
- Is comfortable approving drafts manually.

Do not start with:

- Venture-scale engineering teams.
- Agencies that already have mature automation stacks.
- Enterprises needing deep compliance and SSO.
- Developers looking for a better Claude Code or Codex wrapper.

### 4.2 Buyer Anxiety To Remove

The buyer will hesitate for predictable reasons:

- "Will it spend money?"
- "Will it send something embarrassing?"
- "Will I understand what happened?"
- "Will credits disappear?"
- "Will my data be trapped?"
- "Is this just a toy dashboard?"
- "Is it pretending to do work?"

Therefore the MVP must make control and proof more visible than intelligence.
The first session should show:

- What the agent plans to do.
- What sources it used.
- What it drafted.
- What needs approval.
- What it will cost.
- What changed in company memory.
- What the founder can export.

## 5. Product Principles

1. Founder stays in control.
   External, irreversible, public, financial, or customer-facing actions require
   approval.

2. Growth Center is the command center.
   The first screen shows company pulse, loops, runs, approvals, signals,
   assets, metrics, and learning.

3. Wiki is the memory moat.
   Durable company knowledge lives in canonical markdown-like records with
   provenance and review.

4. Skills are operating procedures.
   Repeated work becomes reusable company procedure through review.

5. Runs replace tasks.
   A run is a traceable execution record. No task Kanban.

6. Loops replace projects.
   Loops are recurring operating machines: daily growth, weekly review,
   customer discovery, launch, support, pricing.

7. Internal lock-in before integrations.
   LAF Pages, CRM, Campaigns, Inbox, Assets, Metrics come before deep external
   connectors.

8. Draft first, approve second, execute third.
   The MVP should mostly draft and prepare. Execution grows only where controls
   are strong.

9. Every output becomes an object.
   Drafts, approvals, assets, customers, signals, metrics, receipts, and wiki
   updates are first-class records.

10. No model or prompt jargon in founder UI.
    Hide runtime details unless useful for trust, cost, or debugging.

## 6. Non-Negotiable Removal

Remove from primary product:

- Projects.
- Tasks.
- Task boards.
- Task keys.
- Task detail modal.
- Project detail page.
- Project-scoped local execution setup readiness.
- GitHub repo requirement.
- PR and code-review language.
- customer-managed execution setup.
- Local CLI detection.
- Local execution mode toggles.

These can exist as hidden migration or advanced developer code during the
transition, but they must not appear in founder onboarding, primary navigation,
Growth Center, or default settings.

## 7. Workspace Model

### 7.1 Concepts

- Account: a human identity.
- Workspace: a company operating space.
- Teammate: an account with workspace membership.
- Owner: workspace creator or promoted admin.
- Member: teammate with workspace access.
- Guest: post-MVP page/object-scoped access, not required for MVP.

### 7.2 Rules

- Every new account gets one default workspace.
- A user can belong to multiple workspaces through invitations.
- If the user belongs to multiple workspaces, show a small workspace switcher.
- Any teammate can invite another teammate in the MVP.
- Later workspace policy can restrict invitations to owners/admins.
- Billing attaches to workspace.
- Company memory, customers, assets, approvals, loops, runs, metrics, and skills
  are scoped to workspace.

### 7.3 Tables

Use existing team/membership tables where pragmatic, but expose the product as
account/workspace.

Required logical tables:

- `accounts`
- `workspaces`
- `workspace_memberships`
- `workspace_invites`
- `workspace_settings`

Minimal fields:

```text
accounts
- id
- email
- display_name
- avatar_url
- created_at
- updated_at

workspaces
- id
- owner_account_id
- name
- slug
- company_profile_id
- billing_status
- created_at
- updated_at

workspace_memberships
- id
- workspace_id
- account_id
- role: owner | admin | member
- status: active | invited | removed
- created_at
- updated_at

workspace_invites
- id
- workspace_id
- email
- role
- token_hash
- invited_by
- accepted_by
- status: pending | accepted | expired | revoked
- expires_at
- created_at
```

## 8. Core Domain Model

### 8.1 Objects

Company Profile:

- Business identity, stage, audience, offer, constraints, voice, goals.

Department:

- Stable business function staffed by one or more agents.

Signal:

- Incoming piece of business evidence or opportunity.

Loop:

- Recurring or one-shot operating machine.

Run:

- One execution of a loop, skill, or founder command.

Approval:

- Decision gate for risky or important action.

Artifact:

- Draft or generated output.

Asset:

- Approved or saved reusable artifact.

Customer Record:

- Lead, prospect, customer, account, or interview participant.

Metric Snapshot:

- Timestamped business measurement.

Skill:

- Reusable company operating procedure.

Wiki Memory:

- Canonical durable knowledge.

Receipt:

- Human-readable and machine-readable proof of what happened.

### 8.2 Logical Tables

```text
company_profiles
- id
- workspace_id
- name
- stage
- one_liner
- audience
- problem
- offer
- brand_voice
- approval_policy
- created_at
- updated_at

departments
- id
- workspace_id
- slug
- name
- description
- active

signals
- id
- workspace_id
- source_type
- source_ref
- title
- summary
- payload_json
- confidence
- status: new | triaged | used | archived
- created_by
- created_at

loops
- id
- workspace_id
- slug
- name
- department
- cadence: manual | daily | weekly | monthly
- mode: draft_first | approval_first | internal_auto
- enabled
- approval_policy_json
- input_policy_json
- output_policy_json
- last_run_at
- next_run_at
- created_at
- updated_at

runs
- id
- workspace_id
- loop_id
- skill_id
- department
- agent_slug
- requested_by
- mode
- status
- objective
- input_refs_json
- output_refs_json
- cost_estimate_cents
- actual_cost_cents
- started_at
- completed_at
- created_at
- updated_at

approvals
- id
- workspace_id
- run_id
- type
- risk_level: low | medium | high | critical
- title
- summary
- proposed_action_json
- source_refs_json
- status: pending | approved | rejected | revision_requested | cancelled
- requested_by_agent
- decided_by
- decided_at
- created_at

artifacts
- id
- workspace_id
- run_id
- type
- title
- content_ref
- content_text
- metadata_json
- status: draft | approved | saved | published | archived
- created_at
- updated_at

assets
- id
- workspace_id
- artifact_id
- type
- title
- slug
- content_ref
- metadata_json
- visibility: internal | public
- created_at
- updated_at

customer_records
- id
- workspace_id
- name
- segment
- stage
- source
- problem
- desired_outcome
- objections
- consent_basis
- metadata_json
- created_at
- updated_at

metric_snapshots
- id
- workspace_id
- metric_key
- value_number
- value_text
- source_type
- source_ref
- captured_at
- created_at

receipts
- id
- workspace_id
- run_id
- summary
- decisions_json
- approvals_json
- changed_refs_json
- next_actions_json
- created_at
```

## 9. Navigation And Screens

### 9.1 Primary Navigation

- Home
- Growth Center
- Company Wiki
- Customers
- Campaigns
- Assets
- Approvals
- Metrics
- Agents
- Skills
- Settings

Do not include Projects or Tasks.

### 9.2 Home

Purpose:

- Fast orientation for founder.

Content:

- Company one-liner.
- Current stage.
- North-star goal.
- This week's focus.
- Top pending approval.
- Recent run receipt.
- Suggested next command.

### 9.3 Growth Center

Purpose:

- Primary command center.

Sections:

1. Company Pulse
   - Stage
   - Goal
   - Focus
   - Active loops
   - Pending approvals
   - Customer/revenue signal

2. Founder Command
   - Natural language command
   - Suggested commands
   - Mode selector:
     - Draft only
     - Prepare approval
     - Run internal loop

3. Operating Loops
   - Daily Growth
   - Weekly Review
   - Customer Discovery
   - Landing Page
   - First 100 Customers
   - Content Engine
   - Support
   - Pricing

4. Live Runs
   - Running, waiting, completed, needs attention.

5. Approval Desk
   - Public, money, customer promise, memory, skill, sensitive data.

6. Compounding Knowledge
   - Signals captured.
   - Wiki updates.
   - Skill improvements.
   - Lint warnings.
   - Learned updates.

Map current Growth Center terms:

- Notebook drafts -> Signals and draft observations.
- Review queue -> Approval Desk and memory review.
- Wiki playbooks -> Operating skills and company wiki.
- Compiled skills -> Active company procedures.
- Invocations -> Runs.
- Learned updates -> Skill evolution and wiki synthesis.

### 9.4 Company Wiki

Purpose:

- Readable company memory.

Default namespaces:

```text
company/profile.md
company/strategy.md
company/brand-voice.md
company/offer.md
company/icp.md
company/pricing.md
company/risks.md
company/weekly-reviews/YYYY-WW.md
customers/{slug}.md
campaigns/{slug}.md
assets/{slug}.md
experiments/{slug}.md
loops/{slug}.md
skills/{slug}.md
receipts/{run_id}.md
```

### 9.5 Customers

Purpose:

- First-party CRM.

MVP fields:

- Name
- Segment
- Stage
- Source
- Problem
- Desired outcome
- Objections
- Consent/contact basis
- Last interaction summary
- Related runs
- Related artifacts
- Related wiki facts

### 9.6 Campaigns

Purpose:

- First-party campaign planner and draft workspace.

MVP:

- Campaign brief.
- Audience.
- Offer.
- Channels as labels, not integrations.
- Draft copy.
- Approval state.
- Related metrics.

### 9.7 Assets

Purpose:

- Durable business outputs.

MVP asset types:

- Landing page draft.
- Waitlist page.
- Offer page.
- Campaign draft.
- Email sequence draft.
- Social post draft.
- Lead list.
- Customer interview brief.
- Pricing page.
- Support macro.
- SOP.
- Brand guide.
- Weekly review.

### 9.8 Approvals

Purpose:

- Founder control and trust.

Approval groups:

- Public.
- Money.
- Customer promise.
- Memory.
- Skill.
- Sensitive data.

Approval detail must show:

- What will happen.
- Why the agent recommends it.
- Draft output.
- Source context.
- Risks.
- Cost or budget impact.
- Whether reversible.
- Buttons: approve, edit, reject, request revision.

### 9.9 Metrics

Purpose:

- Business outcomes, not token diagnostics.

MVP metrics:

- Leads.
- Waitlist signups.
- Replies.
- Interviews booked.
- Conversion rate.
- Revenue.
- Active customers.
- Campaign output.
- Support load.
- Approval backlog.
- Loop reliability.
- Skill learning velocity.

Token and cost diagnostics move to Settings or admin.

### 9.10 Skills

Purpose:

- Company operating procedures.

Rename visible copy:

- "Shared skills" -> "Operating skills."
- "Playbooks" -> "Procedures."
- "Execution logs" -> "Run receipts."
- "Learned updates" -> "Procedure improvements."

## 10. Departments And Agents

Departments:

- CEO Office: strategy, prioritization, operating cadence.
- Growth: acquisition, experiments, funnel movement.
- Marketing: positioning, content, landing pages, launch.
- Sales: ICP, lead research, outreach drafts, objections.
- Customer Research: interviews, surveys, insight synthesis.
- Product: offer, roadmap, feedback loops.
- Builder: LAF-hosted pages, prototypes, internal business assets.
- Support: FAQ, customer issue triage, response drafts.
- Operations: SOPs, fulfillment, process design.
- Finance: pricing, projections, unit economics.
- Risk: claims, compliance reminders, sensitive-action review.
- Reviewer: quality control, memory promotion, approval prep.

Agents are implementation details under departments. Expose departments and
outcomes first; expose agent identity in run receipts and trace views.

## 11. Operating Loops

A loop is a recurring or one-shot operating machine with inputs, cadence,
outputs, approvals, and learning.

Loop schema:

```yaml
id: loop_daily_growth
workspace_id: ws_123
name: Daily Growth Loop
department: growth
cadence: daily
mode: draft_first
enabled: true
inputs:
  - company_profile
  - current_offer
  - customer_records
  - metric_snapshots
  - recent_runs
outputs:
  - growth_signals
  - experiment_recommendations
  - campaign_drafts
  - approval_requests
  - wiki_updates
approval_policy:
  publish_public: required
  send_external: required
  spend_money: required
  customer_promise: required
  write_internal: allowed
learning_policy:
  write_notebook: automatic
  promote_wiki: review_required
  update_skill: review_required
```

MVP loops:

1. Founder Intake Loop.
   - Input: onboarding answers.
   - Output: company profile, ICP draft, offer draft, first recommended loops.

2. Idea Validation Loop.
   - Output: assumptions, risks, competitor notes, validation plan.

3. Landing Page Loop.
   - Output: offer page draft, copy, waitlist CTA, publish approval.

4. First 100 Customers Loop.
   - Output: lead segments, lead list draft, outreach angles.

5. Customer Discovery Loop.
   - Output: interview script, synthesis, updated ICP.

6. Content Engine Loop.
   - Output: 30-day calendar, post drafts, learning notes.

7. Weekly Business Review.
   - Output: weekly review page, metrics, risks, next focus.

8. Support Loop.
   - Output: FAQ, support macros, issue patterns.

9. Pricing Loop.
   - Output: pricing hypothesis, page copy, objections.

## 12. Run State Machine

Run states:

- queued
- preparing_context
- researching
- drafting
- awaiting_approval
- approved
- executing
- writing_receipt
- completed
- needs_attention
- cancelled
- failed

Allowed transitions:

```text
queued -> preparing_context
preparing_context -> researching
researching -> drafting
drafting -> awaiting_approval
drafting -> writing_receipt
awaiting_approval -> approved
awaiting_approval -> cancelled
awaiting_approval -> needs_attention
approved -> executing
executing -> writing_receipt
executing -> failed
writing_receipt -> completed
needs_attention -> drafting
needs_attention -> cancelled
failed -> needs_attention
```

Run detail must include:

- Objective.
- Department and agent.
- Loop or skill.
- Inputs used.
- Sources read.
- Draft artifacts.
- Approval requests.
- Tool calls or internal operations.
- Cost estimate and actual usage.
- Receipt.
- Wiki updates.

## 13. Approval Policy

Default:

- Internal drafts can be created automatically.
- Wiki draft notes can be created automatically.
- Wiki canonical promotion requires review.
- Skill activation or update requires review.
- Public publishing requires approval.
- Outbound communication requires approval.
- Spend or billing change requires approval.
- Customer promise requires approval.
- Sensitive data import/export requires approval.
- Delete/destructive action requires approval.

Approval policy object:

```json
{
  "publish_public": "required",
  "send_external": "required",
  "spend_money": "required",
  "customer_promise": "required",
  "sensitive_data": "required",
  "promote_wiki": "required",
  "activate_skill": "required",
  "internal_draft": "allowed"
}
```

Risk levels:

- low: internal draft or summary.
- medium: canonical memory, reusable skill, customer record update.
- high: public page, outbound message, pricing change.
- critical: money spend, legal claim, irreversible deletion, customer promise.

## 14. Cloud Execution Architecture

No customer-managed runtime.

Components:

- Web app.
- Hosted API.
- Postgres database.
- Object storage for artifacts.
- Job queue.
- Cloud worker.
- Model broker.
- Tool sandbox.
- Approval executor.
- Receipt writer.
- Wiki writer/indexer.
- Skill compiler.
- Metrics collector.

Execution flow:

1. User creates command or loop trigger fires.
2. API creates `run`.
3. Worker builds context packet from workspace, wiki, customers, assets, metrics,
   skills, and recent receipts.
4. Agent drafts artifacts and proposed actions.
5. Worker creates approvals for risky actions.
6. If no approval required, worker writes receipt and updates wiki.
7. If approval required, run pauses at `awaiting_approval`.
8. User approves, edits, rejects, or requests revision.
9. Approval executor applies approved action.
10. Receipt writer records what happened.
11. Wiki writer stores durable learning.
12. Skill compiler proposes procedure updates when repeated patterns emerge.

## 15. API Surface

MVP endpoints:

```text
GET  /workspaces
POST /workspaces
GET  /workspaces/:id
PATCH /workspaces/:id

POST /workspaces/:id/invites
GET  /workspaces/:id/members
PATCH /workspaces/:id/members/:membership_id

GET  /company/profile
PATCH /company/profile

GET  /growth/summary
POST /growth/command

GET  /loops
POST /loops
PATCH /loops/:id
POST /loops/:id/run

GET  /runs
GET  /runs/:id
POST /runs/:id/cancel

GET  /approvals
GET  /approvals/:id
POST /approvals/:id/approve
POST /approvals/:id/reject
POST /approvals/:id/revise

GET  /signals
POST /signals
PATCH /signals/:id

GET  /customers
POST /customers
PATCH /customers/:id

GET  /artifacts
GET  /artifacts/:id
POST /artifacts/:id/save-asset

GET  /assets
GET  /assets/:id
PATCH /assets/:id

GET  /metrics/snapshots
POST /metrics/snapshots

GET  /skills
POST /skills
POST /skills/:name/invoke

GET  /wiki/catalog
GET  /wiki/article
POST /wiki/write
```

Existing endpoints can be kept behind compatibility layers. New UI should call
the new domain endpoints.

## 16. Memory And Context Packets

Replace `agent-memory/v1` task/project packet with `company-memory/v1`.

Shape:

```json
{
  "workspace": {
    "id": "ws_123",
    "name": "Acme Startup"
  },
  "company": {
    "profile_ref": "wiki:company/profile.md",
    "stage": "idea",
    "goal": "validate paid demand"
  },
  "run": {
    "id": "run_123",
    "objective": "draft first 100 customer plan",
    "mode": "draft_first"
  },
  "loop": {
    "id": "loop_first_100",
    "name": "First 100 Customers"
  },
  "must_read": [
    "wiki:company/icp.md",
    "wiki:company/offer.md"
  ],
  "loaded_context": [],
  "customers": [],
  "signals": [],
  "metrics": [],
  "recent_receipts": [],
  "active_skills": [],
  "approval_policy": {},
  "must_obey": [
    "Do not send external messages without approval.",
    "Do not make public claims without approval."
  ],
  "write_back": {
    "draft_notes": "notebook",
    "canonical_memory": "wiki_review_required",
    "receipt": "required"
  }
}
```

## 17. Wiki Contract

Keep WIKI-SCHEMA guarantees:

- Markdown/source records are canonical.
- Indexes are rebuildable.
- Writes are serialized.
- Provenance is visible.
- Contradictions are linted.
- Draft observations do not auto-promote to canonical memory.

New extraction targets:

- company
- customer
- campaign
- asset
- experiment
- loop
- skill
- receipt

Do not extract project/task facts in the new default flow.

## 18. Skill System

Skills become operating procedures.

Lifecycle:

1. Runs produce repeated behavior.
2. Agent writes draft note.
3. Reviewer proposes a skill update.
4. Founder or reviewer approves.
5. Skill activates.
6. Future runs invoke it.
7. Receipts feed learned updates.

MVP skill packs:

- idea-validation
- icp-synthesis
- offer-design
- landing-page-copy
- lead-segment-research
- cold-outreach-draft
- content-calendar
- interview-script
- interview-synthesis
- objection-handling
- pricing-test
- weekly-business-review
- support-response
- faq-update
- risk-review
- founder-update-memo

Skill object:

```text
skills
- id
- workspace_id
- name
- title
- description
- content
- trigger
- tags
- status: proposed | active | rejected | archived
- version
- created_by
- approved_by
- usage_count
- last_used_at
- created_at
- updated_at
```

## 19. First-Party Modules

Build first-party modules before integrations.

### LAF Pages

MVP:

- Hosted waitlist/landing page.
- Draft, preview, approve, publish.
- LAF subdomain.
- Basic event capture.

No external CMS required.

### LAF CRM

MVP:

- Lead/customer records.
- Segments.
- Stages.
- Notes.
- Related runs/assets/wiki facts.

No HubSpot/Salesforce sync in MVP.

### LAF Campaigns

MVP:

- Campaign briefs.
- Draft content.
- Approval state.
- Manual export/copy.

No automatic email sending or ad spend in MVP.

### LAF Inbox

MVP:

- Internal message/support queue simulation.
- Draft replies.
- Approval before outbound.

No live Gmail integration in MVP.

### LAF Assets

MVP:

- Approved artifacts saved as assets.
- Asset library and detail view.

### LAF Metrics

MVP:

- Manual metric snapshots.
- First-party page events.
- Weekly review summary.

## 20. Billing And Packaging

Avoid Polsia's confusing first impression around task credits and revenue share.

MVP pricing model:

- Starter: USD 49/month, one workspace, one founder seat, included runs for
  idea validation, landing page draft, first 100 customers, and weekly review.
- Growth: USD 149-199/month, more runs, pages, CRM records, assets, and
  teammates.
- Concierge setup: optional USD 499-1,500 one-time onboarding for founders who
  want LAF configured around an existing offer, customer list, or website.
- Usage: transparent extra run credits only after included runs are exhausted.
- No mandatory revenue share in MVP.

Billing principles:

- Show included runs.
- Show estimated cost before expensive run.
- Show actual usage after run.
- Never spend ad money in MVP.
- Never charge off-session usage beyond explicit plan/credit rules.

Possible later model:

- Optional success-fee or incubator plan only for customers who opt in.

### 20.1 Packaging Rule

Never lead with "credits." Lead with operating outcomes:

- Validate my idea.
- Draft my landing page.
- Plan my first 100 customers.
- Draft my weekly content and outreach.
- Review my company progress.

Credits are a transparent usage limit behind those outcomes. A founder should
understand what they bought before they understand the metering system.

### 20.2 Sales Page Claims

Allowed claims:

- Founder-controlled AI Startup Office.
- AI departments for validation, marketing, sales, operations, and learning.
- Draft-first workflow with approval gates.
- Receipts and sources for every run.
- Exportable company memory, assets, customers, and receipts.
- Safer, more transparent alternative to fully autonomous company tools.

Forbidden claims:

- Guaranteed revenue.
- Fully autonomous business with no founder involvement.
- Legal, tax, investment, or regulated advice.
- Automatic ad spend, email sending, or public posting in MVP.
- "50 employees" as a literal labor replacement claim. Use it only as a
  metaphor in founder-facing copy, paired with approval and control language.

### 20.3 Confidence Gate

Before launching paid self-serve, LAF must pass these commercial checks:

1. A cold founder can explain the product after seeing the first screen for 30
   seconds.
2. The first demo creates at least one asset the founder would actually use.
3. The founder can see the approval queue without asking where control lives.
4. The founder can see receipts without asking what the AI did.
5. The founder can identify the next recommended operating loop.
6. The pricing page explains outcomes before usage limits.
7. The product can sell as a 7-day launch office even if external integrations
   are absent.
8. The product does not need local setup, GitHub, local execution setup, CLI tools, or a
   developer environment.
9. The founder can export core records.
10. A concierge sale can be fulfilled with the same product surface and
    first-party records, not a hidden services spreadsheet.

## 21. Safety, Legal, And Trust

MVP must include:

- Approval gate for public/external/financial/customer-promise actions.
- Receipt for every run.
- Source/provenance list for each artifact.
- Clear labels: draft, projection, approved, published.
- Cost estimate and run usage.
- Export path for wiki, assets, customers, receipts.
- Workspace activity log.
- Delete workspace flow with clear warnings.
- No legal, tax, financial, medical, or regulated advice positioning.
- No fake customer reviews.
- No unsourced public claims.
- No outbound spam.
- No browser automation against third-party sites in MVP.
- No ad spend in MVP.

## 22. Implementation Plan

The implementation plan is split into two tracks:

- Product launch track: the full service path needed for self-serve sales.
- Current branch track: the immediate verified development phases to start the
  pivot safely in this repo.

### 22.1 Product Launch Track

#### Phase 1: Domain and UI Reframe

Goal:

- Remove project/task UX and launch the new Growth Center shell.

Work:

- Hide Projects and Tasks navigation.
- Rename Growth Center copy.
- Add workspace/account language.
- Add Company Profile.
- Add new navigation.
- Add Run, Loop, Approval, Signal, Artifact, Asset logical models.

Acceptance:

- A new user lands in Growth Center, not Projects or Tasks.
- No default screen asks for local execution setup, repo, project, or task.

#### Phase 2: Onboarding And Company Memory

Goal:

- Convert founder idea into durable company memory.

Work:

- Onboarding questions.
- Default workspace creation.
- Company profile creation.
- Initial wiki namespace materialization.
- Founder Intake Loop.

Acceptance:

- Signup creates workspace, company profile, initial wiki pages, and first Growth
  Center pulse.

#### Phase 3: Runs, Loops, And Approvals

Goal:

- Replace task workflow with traceable cloud runs.

Work:

- Run API.
- Loop API.
- Worker queue.
- Approval API.
- Run detail drawer.
- Approval Desk.
- Receipt writer.

Acceptance:

- User can run Idea Validation Loop and see run status, artifact, approval, and
  receipt.

#### Phase 4: Wiki And Skills Compounding

Goal:

- Make LAF improve from repeated runs.

Work:

- `company-memory/v1` packet.
- Company wiki extraction.
- Skill proposal from receipts.
- Approval for skill activation.
- Growth Center learned-updates panel.

Acceptance:

- Repeated loop runs propose a skill update and write reviewed wiki memory.

#### Phase 5: First-Party Business Modules

Goal:

- Make the product sellable as a business-in-a-box workspace.

Work:

- LAF Pages MVP.
- LAF CRM MVP.
- LAF Campaigns MVP.
- LAF Assets MVP.
- LAF Metrics MVP.

Acceptance:

- Founder can create a landing page draft, approve publish, collect/manual-enter
  leads, and produce a weekly review.

### 22.2 Current Branch Track

This branch should start with the smallest code changes that make the pivot
visible and testable without pretending the backend is finished.

#### Branch Phase 0: Sales Thesis And Scope Gate

Goal:

- Make the spec commercially sharper and falsifiable.

Work:

- Add sellable wedge, ICP, buyer anxiety, pricing, sales claims, and confidence
  gate.
- Keep the single-source spec as the authority for the pivot.

Verification:

- `git diff --check`
- Targeted review that the spec no longer reads like a generic agent platform.

Commit:

- `docs: harden startup office sales thesis`

#### Branch Phase 1: Pure-Cloud Startup Office Shell

Goal:

- Make the default web UI stop advertising the old developer/project/local execution setup
  product.

Work:

- Default authenticated workspace route opens Growth Center.
- Hide Projects/Tasks from primary navigation.
- Rename primary labels to Startup Office language.
- Remove project subnav from the default sidebar.
- Change sidebar/runtime summary from task status to run/approval language.

Verification:

- Frontend unit tests for default route and sidebar labels.
- `npm run -w web typecheck`
- `npm run -w web test -- --runInBand` if supported, otherwise focused Vitest.

Commit:

- `feat(web): reframe shell as startup office`

#### Branch Phase 2: Sellable Growth Center Surface

Goal:

- Make Growth Center visibly support the first paid demo even before the full
  cloud worker is implemented.

Work:

- Add Company Pulse panel.
- Add Launch Office operating loops:
  - Idea Validation.
  - Landing Page.
  - First 100 Customers.
  - Weekly Review.
- Add Approval Desk preview.
- Add Receipt/Trace preview.
- Add next recommended action.
- Reuse existing skills/wiki/review data where available and fall back to empty
  safe states.

Verification:

- UI tests assert the sellable panels render.
- UI tests assert project/task/local execution setup terms are absent from the default Growth
  Center.
- `npm run -w web typecheck`
- Focused Vitest for Growth Center and app shell.

Commit:

- `feat(web): add startup office growth center`

#### Branch Phase 3: Trust And Launch Readiness Guard

Goal:

- Prevent regression back to local/dev/task positioning while the rest of the
  product is built.

Work:

- Add a lightweight repo check that scans primary web copy for banned default
  UX terms.
- Document the demo script and manual QA path.
- Add test fixtures for the first founder session.

Verification:

- New guard passes.
- Existing web tests pass.
- `git diff --check`.

Commit:

- `test: guard startup office pivot surface`

### 22.3 First Paid Demo Script

This is the demo path a founder should see before the backend is complete:

1. Open LAF and see AI Startup Office / company workspace language before
   authentication.
2. Create or join a company workspace, not a project team.
3. Complete onboarding around company, audience, offer, and first operating
   loop.
4. Land in Growth Center by default.
5. Show Company Pulse:
   - Stage.
   - Primary goal.
   - Next decision.
6. Show Launch Office loops:
   - Idea Validation.
   - Landing Page.
   - First 100 Customers.
   - Weekly Review.
7. Show Approval Desk and explain that public claims, outbound messages, spend,
   and customer promises stop for founder approval.
8. Show Receipts and Trace and explain sources, drafts, approval status, usage,
   and memory changes.
9. Show existing Skills/Wiki compounding panels as the reason LAF improves with
   repeated use.
10. End with the 7-day launch office promise and pricing package.

### 22.4 Manual QA For Pivot Surface

Before every release on this branch:

1. Run `npm run startup-office:surface`.
2. Run focused web tests for auth, onboarding, navigation, settings, and Growth
   Center.
3. Open the web app locally.
4. Confirm unauthenticated entry says AI Startup Office and company workspace.
5. Confirm default authenticated route resolves to Growth Center.
6. Confirm primary sidebar does not show Projects or Tasks.
7. Confirm hosted settings do not show local execution setup.
8. Confirm Growth Center shows Company Pulse, Launch Office loops, Approval
   Desk, and Receipts/Trace.
9. Confirm no first-session copy asks for GitHub, repo, PR, local CLI, or local execution setup.
10. Confirm local API absence does not blank the UI.

## 23. Test Plan

### Unit Tests

- Workspace creation creates default workspace.
- Workspace invitations create and accept membership.
- Loop state transitions are valid.
- Run state transitions are valid.
- Approval policy detects risky actions.
- Approval decisions update run state.
- Receipts serialize expected fields.
- Company wiki paths materialize.
- Skill proposal and approval states work.
- Growth Center model joins loops, runs, approvals, signals, assets, metrics,
  skills, and wiki counts.

### API Tests

- `/growth/summary` returns complete pulse for empty and populated workspace.
- `/growth/command` creates run.
- `/loops/:id/run` creates run with correct policy.
- `/approvals/:id/approve` resumes run.
- `/artifacts/:id/save-asset` creates asset.
- `/company/profile` updates wiki/materialized profile.
- Legacy project/task endpoints are not used by new UI.

### UI Tests

- Onboarding creates workspace and company profile.
- Growth Center renders company pulse.
- Founder command creates a run.
- Run detail shows source context and receipt.
- Approval Desk groups by risk.
- Approving an artifact saves or publishes it.
- Company Wiki shows new namespaces.
- Skills screen uses operating-skill language.
- Projects/Tasks/local execution setup are not visible in default navigation.

### End-to-End Smoke

Scenario: first founder session.

1. Sign up.
2. Answer onboarding.
3. Open Growth Center.
4. Run Idea Validation Loop.
5. Review artifact.
6. Approve saving artifact.
7. Confirm wiki update.
8. Confirm receipt.
9. Invite teammate.
10. Confirm teammate sees same workspace.

Scenario: landing page.

1. Run Landing Page Loop.
2. Preview page artifact.
3. Approve publish.
4. See page in LAF Pages.
5. Capture or manually add lead.
6. See metric snapshot.
7. Weekly Review includes result.

### Regression

- Existing auth still works.
- Existing wiki catalog still loads.
- Existing skills API still works.
- Existing review state mechanics still work for approvals.
- Hidden legacy project/task routes do not break hosted API tests.

## 24. Launch Checklist

Product:

- Homepage and README position LAF as AI Startup Office.
- No default local execution setup/local CLI copy.
- No default project/task copy.
- Onboarding creates default workspace.
- Growth Center is primary app.
- Approval Desk is visible.
- Export path documented.

Legal/trust:

- Terms state AI output requires review.
- Public/external/financial actions need approval.
- No ad spend or outbound email automation in MVP.
- Data export and deletion behavior documented.
- No revenue share unless explicitly launched as optional plan.

Sales:

- Demo script: idea -> workspace -> Growth Center -> validation loop -> landing
  page draft -> approval -> asset -> wiki -> weekly review.
- Pricing page explains runs/credits simply.
- Comparison page: "safer, more transparent Polsia."
- Founder FAQ covers control, data ownership, approvals, cost, and export.

## 25. Definition Of Done

The service is sellable when:

1. A founder can sign up and get a workspace.
2. Onboarding creates a company profile and wiki memory.
3. Growth Center is the first useful screen.
4. A founder can run at least three loops:
   - Idea Validation.
   - Landing Page.
   - First 100 Customers.
5. Runs have status, sources, artifacts, approvals, and receipts.
6. Risky actions require approval.
7. Approved artifacts become assets.
8. Wiki memory updates persist and can be read.
9. Skills can be invoked and proposed for improvement.
10. Workspace invites work.
11. Projects, Tasks, local execution setup, local CLI, repo, and PR language are absent from
    default UX.
12. Test plan passes.
13. Pricing and trust copy are published.
14. Demo flow works without developer setup.
