# Pure Cloud Startup Office Pivot

Status: planning branch for product pivot

Superseding system spec:

- [AUTONOMOUS-COMPANY-OS.md](AUTONOMOUS-COMPANY-OS.md)

## Decision Thesis

LAF-Office should pivot from a developer-centered AI development workspace into
a pure-cloud AI startup operating system for non-technical founders and
business operators.

Polsia is a direct competitor and a useful market validation signal. LAF should
not copy the "AI runs your company while you sleep" posture blindly. The sharper
counter-position is:

> A safer, more transparent Polsia where the founder stays in control.

The product should feel less like "AI agents for code" and more like:

> One founder controlling a cloud AI company of 50 specialized employees.

Development remains one department, but it is no longer the product center. The
primary customer should not need a terminal, local execution setup, repo checkout, Claude
Code setup, Codex setup, or external automation stack.

The previous project/task workflow is not carried forward. Projects, task
boards, task keys, project detail pages, and repo-backed delivery queues belong
to the old developer workspace product. The new product is organized around a
workspace's company memory, operating loops, skills, growth signals, approvals,
assets, customers, and receipts.

## Positioning

Target positioning:

> LAF is a cloud AI Startup Office that helps a founder validate ideas, plan the
> business, create assets, launch campaigns, manage customers, operate support,
> track metrics, and build product from one controlled workspace.

The user is not buying a chatbot, a coding agent, or an automation builder. They
are hiring an AI company staff.

The competitive promise is not "more autonomous than Polsia." It is powerful
company-wide AI operations with founder-visible plans, approvals, receipts, and
memory.

## Core Customer

Primary customer:

- Non-technical founder with an idea but no operating team.
- Solo founder who needs marketing, operations, sales, research, and product
  help before hiring.
- Small business owner who wants AI staff but does not know how to wire tools.
- Creator or consultant turning expertise into a repeatable business.

Secondary customer:

- Technical founder who already uses Claude Code, Codex, Cursor, or Copilot for
  coding, but wants LAF to run the business side.

The product should not compete for developers' local coding workflows. Those
users already have mature tools and strong preferences.

## Account And Workspace Model

The product should use a Notion-like account and workspace system:

> An account is a person. A workspace is the company operating space.

Every new account gets one default workspace automatically. That workspace owns
the founder profile, agents, operating loops, wiki memory, campaigns, customers,
assets, approvals, and billing context.

Anyone can invite other people into a workspace as teammates. Invited users join
that workspace as members; they do not merge accounts, create a separate company,
or need their own local setup.

An account may therefore have:

- One default workspace created at signup.
- Additional workspace memberships from invitations.

Existing team and membership tables can be reused internally during migration,
but the product language should be `account`, `workspace`, `teammate`, and
`company`.

## Product Boundaries

### Must Be True

- The default product runs fully in the browser and cloud.
- Every account gets one default workspace.
- Any teammate can invite another teammate into the workspace unless later
  workspace policy restricts invitations.
- No primary onboarding path requires local commands or local files.
- Core business workflows run through the hosted workspace and managed workers.
- Business memory, documents, campaigns, customer records, operating records,
  assets, and decisions live inside LAF.
- Project and task-board workflows are removed from the primary product.
- External tool integration is not the first product promise. LAF should create
  a sticky internal operating environment instead of becoming a connector layer.
- Agents produce inspectable work: plans, drafts, assets, customer records,
  experiments, decisions, metrics, receipts, and next actions.
- Risky actions require explicit user approval before execution.

### Must Not Be True

- Do not position LAF as another coding IDE or local agent runtime.
- Do not require users to understand models, prompts, customer-managed runtimes, or
  automation graphs.
- Do not make the MVP depend on Gmail, Notion, Slack, HubSpot, Zapier, Linear,
  or GitHub connectors.
- Do not build agency client portals or complex enterprise workspace governance
  into the MVP.
- Do not let "50 employees" become 50 noisy personas. The experience should
  expose departments and outcomes first, agents second.

## What We Keep

The current codebase has useful bones. Keep and repurpose them.

### Skills

Current skills should become business playbooks and department capabilities.

Examples:

- Market research skill
- Customer discovery skill
- Positioning skill
- Landing page copy skill
- Offer design skill
- Pricing skill
- Sales outreach skill
- Content calendar skill
- Customer support SOP skill
- Finance model skill
- Product spec skill
- Launch checklist skill
- Postmortem skill

Skills should be editable, versioned, reusable, and tied to observable outputs.

### LLM Wiki

The wiki becomes the company's institutional memory:

- Company brief
- Founder profile
- Customer profiles
- Market map
- Competitor notes
- Offers and pricing
- Brand voice
- Product decisions
- Campaign history
- Customer interview notes
- Weekly operating reviews
- Agent receipts

The wiki should be first-class product state, not hidden logs.

### Growth Center

The current Growth Center becomes the primary operating console. Its existing
loop of notebook drafts, review queue, wiki playbooks, compiled skills,
invocations, and learned updates should be reframed as company compounding:

- Signals
- Agent runs
- Review and approval
- Wiki memory
- Skills
- Assets
- Metrics
- Learned updates

Every agent action should land as a visible run, artifact, approval, receipt,
or wiki update. Do not model it as a task card.

### Agent Roles

Existing agent-role structure should expand from engineering roles into company
departments:

- CEO Agent: strategy, prioritization, weekly operating cadence
- COO Agent: operations, SOPs, internal process, scheduling
- CMO Agent: positioning, campaigns, content, launch plans
- Sales Agent: ICP, lead lists, outreach scripts, objections, follow-up
- Customer Research Agent: interviews, survey analysis, insights
- Product Agent: offer, roadmap, requirements, product experiments
- Builder Agent: no-code/code product creation through cloud execution
- Design Agent: brand, landing pages, product visuals, creative direction
- Support Agent: FAQ, support macros, customer issue triage
- Finance Agent: pricing, costs, projections, unit economics
- Legal/Risk Agent: policy checklists, disclaimers, compliance reminders
- Reviewer Agent: quality, consistency, risk, final approval preparation

## What We Remove From The Center

### Local Execution

Local execution is not part of the default product spine.

Near-term treatment:

- Keep the primary product cloud-only.
- Remove local execution setup from homepage, onboarding, and business-workflow
  copy.
- Delete the legacy execution adapter path from the hosted product tree; cloud
  workers are the only execution path for customer workflows.

Long-term treatment:

- Keep self-hosted execution outside this product line unless it becomes a
  separately scoped enterprise SKU.

### Local Development Workflow

Local worktrees, local CLI detection, and local Codex/Claude execution should
not appear in founder onboarding. Product-building requests should be routed
through a cloud Builder department and recorded as runs, artifacts, approvals,
receipts, and wiki updates.

## New Product Surface

### Home

The first screen should be an operating room, not a developer workspace:

- Founder goal input
- Company status
- This week's priorities
- Pending approvals
- Active campaigns
- Customer/revenue signals
- Agent activity feed
- Suggested next moves

### Company OS

Replace project-first navigation with company-first navigation:

- Dashboard
- Strategy
- Customers
- Campaigns
- Product
- Operations
- Finance
- Assets
- Wiki
- Agents
- Approvals
- Growth Center
- Live Runs

If the account belongs to multiple workspaces, show a small workspace switcher.
The default signup path still opens directly into the account's first workspace.

### Playbooks

Playbooks are the primary entrypoint for non-technical users:

- Validate my idea
- Define my ICP
- Build my offer
- Create my landing page
- Plan a launch
- Find first 100 customers
- Create a 30-day content engine
- Prepare cold outreach
- Analyze customer interviews
- Build an MVP
- Set pricing
- Create support operations
- Run a weekly business review

Each playbook should create operating runs, update wiki memory, assign agents,
produce assets, request approvals, and end with visible next actions.

### Internal Lock-In Modules

To avoid becoming a thin connector layer, build first-party modules before
external integrations:

- LAF Pages: landing pages and waitlists hosted by LAF
- LAF CRM: leads, accounts, conversations, tags, lifecycle state
- LAF Campaigns: content calendar, email drafts, ad concepts, launch plans
- LAF Inbox: customer messages and support queue inside LAF
- LAF Assets: brand files, copy, creatives, offer docs
- LAF Metrics: experiments, funnel numbers, weekly KPI snapshots
- LAF Storefront: simple offers, checkout intents, pricing pages

External APIs can still exist under the hood for infrastructure, but the user
experience should remain inside LAF.

## Pure Cloud Architecture Direction

### Control Plane

Keep the hosted API and database as the core product state owner:

- Accounts
- Workspaces
- Workspace memberships and invitations
- Company profile records scoped to a workspace
- Business objects
- Agent runs
- Operating loops
- Growth signals
- Wiki memory
- Playbook runs
- Approvals
- Artifacts
- Audit events
- Usage and billing

### Execution Plane

Replace local execution setup-first execution with cloud workers:

- Agent job queue
- Model broker
- Tool sandbox
- Artifact generator
- Scheduled job worker
- Approval gate executor
- Receipt writer

The execution plane should be stateless where possible. Durable state should
live in Postgres/object storage.

### Storage

Store first-party business artifacts:

- Wiki markdown/doc records
- Generated pages
- Images and brand assets
- Campaign drafts
- Lead/customer records
- Experiment results
- Financial assumptions
- Agent receipts

### Approval Model

All irreversible or externally visible actions need approval:

- Publishing a page
- Sending a campaign
- Charging money
- Making legal claims
- Changing pricing
- Launching paid ads
- Public social posting
- Deleting customer data

The default should be draft-first, approve-second, execute-third.

## Migration Plan

### Phase 1: Product Repositioning

Goal: make the repo and product narrative match the new direction.

Work:

- Rename product language from AI development workspace to AI Startup Office.
- Add Polsia as the direct competitive anchor: safer, more transparent, founder
  controlled.
- Remove project/task workflow from the new product model.
- Lock product language to Notion-like accounts and workspaces.
- Remove local execution setup from primary marketing and onboarding copy.
- Define company-first information architecture around Growth Center, loops,
  approvals, assets, customers, metrics, and wiki.
- Define teammate invitation and workspace membership behavior.
- Add business department roster.
- Add playbook catalog and first-run flow spec.
- Preserve existing development features as hidden/advanced surfaces.

Verification:

- Homepage no longer leads with Codex, Claude Code, local execution setup, or local CLI.
- README describes cloud startup operations as the main product.
- New onboarding creates a default workspace for the account.
- A workspace member can invite another person as a teammate.
- Settings/onboarding stays inside the hosted workspace by default.
- The primary product no longer exposes project boards or task Kanban.

### Phase 2: Business Memory And Playbooks

Goal: turn existing wiki and skill foundations into company memory and
repeatable business operating loops.

Work:

- Add company profile model.
- Add account-to-default-workspace initialization.
- Add workspace invitation and membership model.
- Add operating loop, run, signal, approval, and artifact models.
- Add business wiki sections.
- Add playbook run model.
- Add generated artifact model.
- Convert skills into structured playbook steps.
- Add approval states to playbook actions.

Verification:

- A user can run "Validate my idea" and receive updated company brief,
  competitor notes, ICP draft, risks, and next recommended runs.
- All outputs are stored as durable LAF artifacts, not only chat messages.

### Phase 3: Cloud Agent Execution

Goal: make core workflows run without local execution setup or developer setup.

Work:

- Add cloud job queue.
- Add model routing and budget controls.
- Add scheduled cloud work dispatcher.
- Add receipt and audit log writer.
- Add sandboxed artifact generation.
- Add cloud Builder department for product/mock/site generation.

Verification:

- A user can start a playbook, leave the browser, and return to completed
  drafts, runs, wiki updates, assets, receipts, and pending approvals.
- No local CLI is required.

### Phase 4: First-Party Business Modules

Goal: increase lock-in by keeping work product inside LAF.

Work:

- LAF Pages MVP
- LAF CRM MVP
- LAF Campaigns MVP
- LAF Assets library
- LAF Metrics snapshots
- LAF Inbox/support queue

Verification:

- A founder can go from idea to landing page, waitlist, lead list, campaign
  drafts, and weekly operating review without leaving LAF.

### Phase 5: Monetization And Operating Cadence

Goal: make the product valuable enough to become the founder's daily business
home.

Work:

- Usage-based agent credits
- Plan tiers by company size and agent capacity
- Optional success-fee experiments only after trust is established
- Daily and weekly operating cycles
- Founder approval inbox
- Progress reporting

Verification:

- The product produces a weekly business review with metrics, shipped work,
  learnings, risks, and next-week plan.
- Users have a reason to open LAF every day.

## MVP Cut

The first credible MVP should not build everything.

Build:

- Account signup with one default workspace
- Teammate invitation and workspace membership
- Company profile
- Founder goal intake
- Agent/departments roster
- Wiki-backed company memory
- Growth Center as the operating console
- Operating loops and run history
- Approval inbox
- Playbook catalog
- Three playbooks:
  - Validate my idea
  - Build my offer and landing page
  - Find first 100 customers
- LAF Pages simple hosted landing page
- LAF CRM simple lead table
- Agent receipts

Do not build yet:

- External SaaS integrations
- Device-side runtime
- Project/task Kanban
- Full email sending
- Paid ads execution
- Payments/checkout
- Complex no-code app builder
- Developer IDE features

## Success Criteria

The pivot is working if a non-technical founder can:

1. Enter a rough business idea.
2. Automatically receive one default workspace for that account.
3. Invite another person into that workspace as a teammate.
4. Get a structured company brief and market hypothesis.
5. Run a validation playbook.
6. Generate a landing page and offer.
7. Create a first customer list and outreach plan.
8. See all outputs stored in the workspace.
9. Approve or reject agent work from one inbox.
10. Return next week to a coherent operating review.

The product should make the user feel like they are running a company with a
staff, not chatting with an assistant.
