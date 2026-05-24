# AI Startup Office 90 Point Scorecard

This scorecard records phase-by-phase evidence against the three 90-point
questions.

## Current Scores

| Phase | Sellable service | Code clarity | Launch readiness | Notes |
| --- | ---: | ---: | ---: | --- |
| Baseline after plan freeze | 82 | 74 | 45 | Direction is clear, but the product still needed a concrete paid-beta wedge and demoable seed state. |
| Phase 1: First Wedge And Offer Lock | 85 | 76 | 48 | The product now has explicit paid-beta validation copy, a guarded Startup Office wedge copy module, and an admin/dev demo seed endpoint. |
| Phase 2: Startup Office Frontend Extraction | 88 | 84 | 55 | Startup Office now has a dedicated cloud product surface with live summary API, operating loops, approvals, receipts, artifacts, company memory preview, drawers, and isolated tests. |
| Phase 3: Backend Domain Extraction | 89 | 88 | 60 | Startup Office server behavior is separated into loop definitions, serializers, repository access, and service helpers, which gives the AI worker and memory phases a clean integration boundary. |

## Phase 1 Evidence

- First wedge fixed as paid beta validation for solo founders.
- Startup Office copy now says what outcome the founder gets.
- Onboarding and auth copy point at paid beta validation instead of broad company operation.
- `POST /startup-office/demo-seed` creates:
  - AI Startup Office demo company profile.
  - Idea Validation pending approval.
  - Offer Package artifact.
  - Customer Discovery receipt.
- Demo seed is owner/admin gated and disabled in production unless explicitly enabled.
- Surface guard blocks local bridge, project/task, connector-first, and full-autonomy positioning in primary hosted copy.

## Remaining Before 90+

- Add real cloud AI loop execution.
- Add company memory materialization and retrieval.
- Add billing, usage limits, admin operations, and release gate.

## Phase 2 Evidence

- `SkillsApp.tsx` is back to skill management only; it no longer imports Startup Office API calls or renders the operating console.
- Startup Office API calls live in `web/src/api/startupOffice.ts`.
- The growth route lazy-loads `web/src/components/startup-office/StartupOfficeApp.tsx`.
- Dedicated panels now cover Company Pulse, Operating Loops, Approval Desk, Receipts, Artifacts, and Company Memory preview.
- Founder actions remain explicit: run loop, approve/reject, inspect run detail, inspect artifact, and edit company profile.
- `/startup-office/growth-summary` now returns recent artifacts so the product surface can show real generated outputs.
- Phase 2 test coverage:
  - `StartupOfficeApp.test.tsx` verifies the dedicated surface, loop execution, approval, run/artifact drawers, and profile editing.
  - `SkillsApp.test.tsx` verifies skill management without importing Startup Office surface code.
  - Hosted API tests verify `recent_artifacts` in summary responses.
- Browser smoke covered desktop and mobile widths through the Vite app with mocked hosted API responses. The panel rendered without blank states or overlapping primary content; mocked dev-only EventSource/API-token console errors were expected from the isolated browser harness.

## Phase 3 Evidence

- Startup Office loop definitions now live in `api/lib/startup-office/loopDefinitions.js`.
- Public response shaping and status normalizers now live in `api/lib/startup-office/serializers.js`.
- Supabase table reads, fallback default loops, approval lookup, receipt creation, and slug generation now live in `api/lib/startup-office/repositories.js`.
- Company profile patching and the temporary record-only run draft now live in `api/lib/startup-office/services.js`.
- `api/[...path].js` delegates Startup Office domain behavior through those modules instead of carrying all product logic inline.
- Hosted API tests now pin the module boundaries and still cover profile persistence, loop execution, approvals, receipts, demo seed, and summary artifacts.
