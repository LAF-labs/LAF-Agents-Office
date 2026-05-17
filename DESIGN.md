---
version: beta
name: LAF-Office-notion-workspace
description: Notion-inspired workspace design system for LAF-Office product surfaces, adapted for home chat, projects, task kanban, wiki, skills, settings, and bridge setup. Prioritizes calm density, one-surface layouts, property-like task metadata, and non-developer clarity.
colors:
  primary: "#5645d4"
  canvas: "#ffffff"
  surface: "#f6f5f4"
  hairline: "#e5e3df"
  ink: "#1a1a1a"
  charcoal: "#37352f"
  slate: "#5d5b54"
  success: "#1aae39"
  warning: "#dd5b00"
  danger: "#e03131"
typography:
  primary: "Notion Sans, Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"
rounded:
  button: "8px"
  card: "12px"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  xxl: "32px"
principles:
  - Workspace first, decoration second
  - One surface per object
  - Repeated items may be cards; page sections should use rows and dividers
  - Kanban lanes are property groups, not nested cards
  - Korean-first copy where the page supports Korean
---

# Design System - LAF-Office Notion Workspace

## Source And Intent

This document defines the visual and interaction system for the LAF-Office web
product. It adapts the Notion-inspired `DESIGN.md` from
`VoltAgent/awesome-design-md/design-md/notion` to our actual product surfaces:
home chat, project/task operations, kanban boards, wiki, skills, settings, and
bridge setup.

The goal is not to copy Notion mechanically. LAF-Office should feel like a calm,
editable workspace where agents, projects, tasks, skills, and wiki memory live in
one coherent operating surface. The design should be quiet, legible, and fast to
scan. A non-developer should understand where they are, what can be edited, and
what the system is waiting for.

The previous pixel-office marketing direction is retired for the product app.
Do not use pixel fonts, game UI, dark-only office scenes, isometric decoration,
or novelty animation in the core app.

## Product Context

- Product: LAF-Office, a team workspace for AI agents and humans.
- Primary surfaces: home chat, projects, task kanban, wiki memory, skills,
  settings, bridge/runner status.
- Users: founders, operators, product teams, and technical users who want AI
  agents to work inside a visible team workflow.
- Design posture: Notion-like workspace minimalism, with LAF-Office-specific
  clarity around agent activity, task state, and local/hosted execution modes.
- Primary job: make complex agent work feel inspectable and manageable.

## Design Principles

1. Workspace first, decoration second.
   The UI should feel like a usable workspace, not a landing page or a demo
   poster. Avoid hero compositions inside the product app.

2. Content owns the screen.
   Project detail pages prioritize tasks; wiki pages prioritize reading and
   editing; settings prioritize clear configuration. Controls stay close to the
   object they affect.

3. One surface, one container.
   Do not put cards inside cards inside cards. Use one parent surface, then
   dividers, rows, columns, accordions, and inline panels inside it.

4. Progressive disclosure.
   Advanced setup, local paths, model details, and bridge diagnostics should be
   hidden until needed. Default states must be understandable without reading a
   paragraph.

5. Real objects, not ornamental summaries.
   Show the actual project code, task key, status, assignee, source state,
   session state, or runner state. Avoid decorative widgets that do not help a
   user act.

6. Calm density.
   Use Notion-style spacing and hairline dividers so dense data remains usable.
   Cards should be reserved for repeated items, modals, and framed tools.

7. Korean-first product copy where supported.
   If a page is translated, it must be fully translated. If a technical term must
   remain English, present it as a product term with Korean explanation nearby.

## Color System

Use a warm Notion-like light canvas with restrained purple as the product action
color. Purple is the primary CTA and focus color only. It must not dominate the
entire app.

### Core Tokens

| Token | Hex | Usage |
| --- | --- | --- |
| `--bg` | `#ffffff` | App canvas and page background |
| `--bg-soft` | `#fafaf9` | Slightly separated page bands |
| `--surface` | `#f6f5f4` | Toolbar strips, muted panels, empty states |
| `--surface-soft` | `#f8f5e8` | Warm low-emphasis callouts |
| `--card` | `#ffffff` | Repeated task cards, modal content, framed tools |
| `--border` | `#e5e3df` | Default hairline border |
| `--border-soft` | `#ede9e4` | Quiet dividers |
| `--border-strong` | `#c8c4be` | Inputs, active separators |
| `--text` | `#1a1a1a` | Primary text |
| `--text-warm` | `#37352f` | Body text and dense content |
| `--text-secondary` | `#5d5b54` | Secondary labels |
| `--text-tertiary` | `#787671` | Placeholders, metadata |
| `--text-muted` | `#a4a097` | Disabled and least important copy |
| `--primary` | `#5645d4` | Primary actions, focus rings, active route |
| `--primary-pressed` | `#4534b3` | Pressed primary action |
| `--link` | `#0075de` | Inline links only |
| `--navy` | `#0a1530` | Rare dark hero/banner surface |
| `--success` | `#1aae39` | Done, connected, available |
| `--warning` | `#dd5b00` | Delayed, waiting, attention |
| `--danger` | `#e03131` | Error, blocked, destructive |

### Accent And Tint Tokens

Use tints sparingly to distinguish types and statuses, similar to Notion
database properties.

| Token | Hex | Usage |
| --- | --- | --- |
| `--tint-peach` | `#ffe8d4` | Warning-lite cards, onboarding hints |
| `--tint-rose` | `#fde0ec` | Sensitive or review-related context |
| `--tint-mint` | `#d9f3e1` | Healthy runner, done, successful setup |
| `--tint-lavender` | `#e6e0f5` | LAF model, automation, AI settings |
| `--tint-sky` | `#dcecfa` | CLI/local execution, links to docs |
| `--tint-yellow` | `#fef7d6` | Important but non-blocking guidance |
| `--tint-yellow-bold` | `#f9e79f` | Rare high-emphasis assistant banner |
| `--tint-gray` | `#f0eeec` | Neutral empty state |

### Color Rules

- Primary purple is for the strongest action, active selection, and focus only.
- Inline documentation links use link blue, not primary purple.
- Status colors should appear as small dots, badges, borders, or text. Do not
  flood whole columns with status color.
- Use one tint per semantic area. Do not create rainbow dashboards.
- Default large surfaces stay white or warm gray.

## Typography

Use a Notion-like sans stack across the product.

```css
font-family:
  "Notion Sans",
  Inter,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  Helvetica,
  Arial,
  sans-serif;
```

If `Notion Sans` is unavailable, Inter/system fallback is acceptable. Do not use
pixel fonts or novelty display fonts in the product app.

### Type Scale

| Token | Size | Weight | Line Height | Usage |
| --- | ---: | ---: | ---: | --- |
| `display` | 48px | 600 | 1.15 | Rare onboarding or empty welcome headline |
| `page-title` | 32px | 600 | 1.2 | App page title |
| `section-title` | 22px | 600 | 1.3 | Major section heading |
| `panel-title` | 18px | 600 | 1.4 | Card, modal, and settings group title |
| `body` | 16px | 400 | 1.55 | Primary reading text |
| `body-medium` | 16px | 500 | 1.55 | Emphasized body |
| `small` | 14px | 400 | 1.5 | Secondary rows and descriptions |
| `small-medium` | 14px | 500 | 1.5 | Buttons, active nav, table headers |
| `caption` | 13px | 400 | 1.4 | Metadata and helper text |
| `caption-bold` | 13px | 600 | 1.4 | Badge labels |
| `micro` | 12px | 500 | 1.4 | Dense labels |

### Typography Rules

- Keep letter spacing at `0` in the product app. Do not scale font size with
  viewport width.
- Use 600 weight for headings, 500 for controls, 400 for body.
- Use monospace only for code, commands, task keys, project codes, and logs.
- Long Korean labels must wrap naturally. Never squeeze text into buttons.

## Spacing And Layout

### Spacing Tokens

| Token | Value |
| --- | ---: |
| `xxs` | 4px |
| `xs` | 8px |
| `sm` | 12px |
| `md` | 16px |
| `lg` | 20px |
| `xl` | 24px |
| `xxl` | 32px |
| `section` | 48px |
| `page` | 64px |

### Layout Rules

- App pages use a 1280-1480px content max-width depending on density.
- Operational pages may use full width when boards or tables need it.
- Page gutters: 20px desktop, 16px tablet, 12px mobile.
- Section gaps: 14-20px for app surfaces; 32px+ only for marketing/onboarding.
- Use hairline dividers before nested cards.
- Use empty states inside the same surface, not as separate floating cards.
- Do not add oversized hero sections to the product app.

## Shape, Border, And Elevation

### Radius

| Token | Value | Usage |
| --- | ---: | --- |
| `xs` | 4px | Tiny property tags |
| `sm` | 6px | Badges, inline tokens |
| `md` | 8px | Buttons, inputs, controls |
| `lg` | 12px | Cards, modals, repeated task cards |
| `xl` | 16px | Large dialogs only |
| `full` | 9999px | Status pills and segmented tabs only |

Buttons are 8px rectangles, not pills. Cards are 12px. Avoid stacking multiple
rounded surfaces.

### Borders And Shadows

| Level | Treatment | Usage |
| --- | --- | --- |
| Flat | 1px `--border` | Default cards, board lanes, rows |
| Subtle | `0 1px 2px rgba(15,15,15,.04)` | Hover or selected light emphasis |
| Card | `0 4px 12px rgba(15,15,15,.08)` | Modals and prominent repeated cards |
| Modal | `0 16px 48px rgba(15,15,15,.16)` | Dialogs, drawers, history panels |

Do not use heavy shadows for ordinary settings groups or board columns.

## Core Components

### Buttons

- Primary: purple background, white text, 8px radius, 40-44px height.
- Secondary: white/transparent, strong hairline border, warm text.
- Ghost: transparent, used for low-risk inline actions.
- Destructive: white background with danger border/text until confirmed.
- Icon buttons: square 36-40px, 8px radius, tooltip for ambiguous icons.

Use icon buttons for familiar actions when possible. Do not create text pills for
simple icon actions.

### Inputs

- Height: 44px desktop and mobile.
- Background: white.
- Border: `--border-strong`.
- Focus: 2px primary ring or border. Ensure no layout jump.
- Helper text: 13px, tertiary, below the field.
- Errors: danger text plus concise correction.

### Cards And Panels

Cards are for repeated content items, modal bodies, and framed tools. A page
section should not look like a card unless it is a single coherent object.

Use internal rows and dividers:

- Header row: object title, metadata, actions.
- Body rows: label/value pairs or controls.
- Expandable advanced rows: hidden by default.
- Footer row: save state or secondary help.

### Badges And Status

- Status badges are small, rounded full only when they behave like properties.
- Use a colored dot plus text for operational state in dense rows.
- Task status colors:
  - Todo: gray
  - In progress: primary or sky
  - Review: lavender
  - Blocked: warning or danger depending severity
  - Done: success
- Runner/bridge status should avoid scary wording unless the user must act.

### Menus, Popovers, And Tooltips

- Menus use white background, 12px radius, 1px border, modal-level shadow.
- Tooltips appear on hover/focus, 12-13px text, max-width 320px.
- Technical tooltips must state the user's next action, not internal failure
  names.

## App Shell

### Sidebar

The sidebar behaves like Notion's workspace navigation:

- White or very light background.
- Current route uses a subtle gray fill and primary dot/accent.
- Icons sit before labels; labels remain readable.
- Workspace summary and usage meters stay quiet at the bottom.
- Growth Center and Skills are separate route groups. Use Korean labels where
  the page supports Korean.

### Top Bar

- Keep top bars thin and functional.
- Search, settings, status, and session controls belong here.
- Avoid using a second card-like header below the top bar unless the page object
  needs its own header.

### Empty States

Empty states are compact and local:

- One sentence explaining what is empty.
- One clear action when action is possible.
- No oversized illustration inside operational pages.

## Home Chat

Home chat should feel like a focused ChatGPT-like workspace inside Notion-like
chrome.

### Layout

- Conversation column centered with comfortable max-width.
- User messages align right; agent messages align left.
- Bubbles are real message containers, 12px radius, with enough line-height for
  Korean text.
- Input sits visually separate from message history, with at least 20-28px
  breathing room.
- CLI/LAF toggle sits below or adjacent to the composer, never crowded.
- Session controls live top-right: "new session" and history icon.

### Message Behavior

- If no agent is mentioned, do not display an implicit mention in the user's
  bubble. The orchestrator answers as the default responder.
- If a specific agent is mentioned, only that agent should be visibly responding
  unless the workflow explicitly creates internal collaboration.
- Agent thinking state uses a small bubble with animated dots.
- Streaming responses append text to the same bubble immediately as chunks
  arrive. Do not create a separate "blocked" or system-looking bubble for normal
  unavailable tools.

### Mentions

- `@` opens people and agents.
- `#` opens projects.
- `/` opens registered skills with a wider picker that includes one-line
  summaries.
- Mention pickers should look like Notion slash command menus: white panel,
  grouped rows, subtle hover/active background, keyboard navigation.

## Projects

### Project Directory

Project lists should be table/list-first, not marketing cards. Each row/card
shows:

- Project code
- Project name
- Short description
- Task count
- Health/status
- Runner/bridge readiness if relevant

Project code is required, uppercase letters only. Task IDs use the project code
as prefix, for example `SAJU-1`. Two projects may both have local task number 1
because the full key carries the project identity.

### New Project Modal

Use a large modal with detailed fields:

- Required: project name, project code.
- Recommended: summary, GitHub URL, additional context.
- Optional: agent recipe markdown.

Do not use a tiny popover for object creation. Users need room to write.

## Project Detail

The project detail page must prioritize the task board.

### Header

Use one project header card only.

- Left: back button, project code badge, project name, project slug/id.
- Right: save state and an "Info" expand/collapse button.
- Expanded info opens as the lower part of the same card.
- No separate "Project information" card below the header.
- No card inside card. Use a top divider inside the same header card.

### Project Info Expansion

Collapsed by default. When expanded, show:

- Project name
- Project code
- GitHub link
- LAF Bridge work location
- Summary
- Additional info
- Agent recipe upload/edit area

LAF Bridge work location defaults to managed checkout. Personal local folder is
advanced and should be hidden until the user chooses "use existing folder."
Because local paths are per-person, the UI must say this setting applies only to
the current user.

Never show "online bridge unavailable" or old "my bridge" wording when the team
runner is connected. Show the user's next useful action instead.

### Task Toolbar

Use a compact row above the board:

- Status chip
- Total task count
- Runner signal
- New task button at the far right

This toolbar may be a single bordered strip, but it must not compete with the
kanban board.

## Kanban Board

Use Notion board-view behavior adapted to LAF tasks. Notion boards group
database pages by a property; moving a card updates that property. LAF task cards
are the database pages, and `status` is the grouping property.

### Board Structure

- Board is a flat horizontal group of lanes, not a card containing card columns.
- Lanes use vertical dividers and quiet headers.
- Each lane header shows status name and count.
- Empty lanes show a dashed local empty target inside the lane.
- The board scrolls horizontally when needed and preserves lane widths.
- Status order is stable:
  1. Todo
  2. In progress
  3. Review
  4. Blocked
  5. Done

### Task Cards

Cards are the only card-like elements inside the board.

Each task card shows:

- Task key, for example `SAJU-1`
- Status property chip
- Title
- Short detail/summary, clamped to 2-3 lines
- Assignee
- Creator/source
- Optional due or runner state if useful

Use 12px card radius, white background, 1px border, small internal spacing.
Selected card uses a primary left rail or border emphasis, not a thick glowing
outline.

### Interaction

- Clicking a card opens the task detail drawer.
- Dragging between lanes updates status when drag-and-drop is implemented.
- Creating a task in a lane should prefill that lane's status.
- Hide empty groups only if the user explicitly chooses that view. Otherwise
  empty lanes help explain workflow state.
- Do not make lane headers or empty states look like separate cards.

## Task Detail

Task detail opens in a right drawer.

- Header: task key, editable title, status, close.
- Body: properties first, then instructions/context, then activity.
- Conversation/activity should be chronological and readable.
- Source conversation may be shown as deleted, but private home session IDs must
  not be exposed to users.
- Delivery summary and verification evidence should be easy to find.

## Wiki

Wiki should feel like Notion documentation:

- Left catalog/sidebar for sections.
- Main article reading/editing surface with generous line-height.
- Inline links and wiki references are blue or subtle underlined tokens.
- Article metadata stays quiet.
- Editing states use a clear toolbar, autosave indicator, and conflict banner.
- Review/promote flows use modal or drawer surfaces, not scattered cards.

## Skills

Skills are reusable slash-command instructions.

- Skills page is separate from Growth Center.
- List view prioritizes name, summary, status, owner/source, and updated time.
- Manual registration opens a large modal.
- Required: skill name, trigger/slug, instruction body.
- Recommended: one-line summary, when to use, examples, tags.
- Actions: approve, edit, update, delete.
- Skill picker in chat uses a Notion slash-command style menu with summary text.

## Settings

Settings should remain the design benchmark for the app:

- Left settings section nav.
- Right pane with grouped forms.
- Groups use single surfaces with internal rows.
- Use compact explanations; avoid paragraphs that feel like docs pasted into UI.
- Model defaults are team-wide. Each agent stores values for Claude, Codex, and
  LAF. LAF uses a 5-level quality/cost abstraction until concrete models are
  finalized.

## Bridge And CLI Mode

Execution mode should be understandable without developer knowledge.

- The home composer has a CLI/LAF toggle.
- Toggle on: LAF. Toggle off: CLI.
- If neither CLI nor LAF is available, disable the toggle and explain the next
  step in a hover/focus tooltip.
- CLI tooltip names the detected CLI: Codex or Claude.
- LAF tooltip says LAF model is being used.
- Do not keep legacy "Record" wording.

Bridge setup should be an onboarding flow:

1. Install command
2. Generate setup/pairing code if required
3. Connect
4. Ready

The user should understand why each step exists. Avoid exposing pairing codes
before the user needs them.

## Motion

Use motion sparingly.

- Duration: 120-180ms for expansion, dropdowns, and drawers.
- Easing: simple ease-out.
- No playful bounces in operational UI.
- Thinking dots may animate continuously, but quietly.
- Streaming text should appear immediately without layout jumps.

Respect `prefers-reduced-motion`.

## Responsive Behavior

| Breakpoint | Behavior |
| --- | --- |
| `<480px` | Single column, drawers become full-screen sheets |
| `480-767px` | Composer and modals keep 12-16px gutters |
| `768-1023px` | Sidebar may collapse; boards scroll horizontally |
| `1024-1279px` | Full product layout |
| `>=1280px` | Board and project detail may use wider workspace |

Touch targets must be at least 40px, preferably 44px for inputs and primary
actions.

## Anti-Patterns

- Card inside card inside card.
- Separate project info card below the project header.
- Marketing hero layouts inside product pages.
- Purple everywhere.
- Pill buttons for ordinary actions.
- Heavy shadows on normal cards.
- Giant empty states that push real work below the fold.
- Technical failure text like "Blocked:" when the user asked for a normal reply.
- Showing private home session IDs in public task or request surfaces.
- Using old My Bridge/Team Bridge copy after runner unification.
- Hiding the actual task key or project code.
- English-only labels on pages that otherwise support Korean.

## Implementation Checklist

Before changing UI, verify:

- Is this page an operational workspace or a marketing/onboarding page?
- Is there exactly one parent surface for the object?
- Are repeated items the only nested cards?
- Can a non-developer understand the default state?
- Does the page still work in Korean?
- Does the board/list/table show the actual object identity?
- Is advanced setup hidden until requested?
- Is the primary action visually obvious but not shouting?

Before finishing UI work, check:

- Desktop and mobile layout.
- Text wrapping in Korean and English.
- Empty state, loading state, error state.
- Disabled state and tooltip/focus help.
- Keyboard reachable controls.
- No overlapping text or controls.

## Source Notes

- Base design inspiration: Notion-style workspace minimalism from
  `VoltAgent/awesome-design-md/design-md/notion/DESIGN.md`.
- Board behavior: Notion board views group pages by a database property and let
  cards move through those groups. LAF adopts that model for project tasks, with
  task status as the grouping property.
