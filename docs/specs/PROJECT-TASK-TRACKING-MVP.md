# Project Task Tracking MVP

LAF-Office now treats projects as first-class task scopes. The MVP keeps the existing
office task lifecycle and adds a lightweight Jira-style project filter on top.

## What ships

- `POST /projects` creates an active project.
- `GET /projects` lists active projects visible to the viewer.
- `GET /projects/repo-readiness?id=<project_id>` checks the selected project's
  GitHub CLI readiness without storing team-wide repository state.
- `POST /tasks` accepts `project_id` when creating or updating a task.
- `GET /tasks?project_id=<id>` returns only tasks for that project.
- The Tasks app can create projects, switch between projects, and show project
  labels on task cards.

## Project Memory Contract

Every project owns a wiki article at `team/projects/{project_id}.md`. Creating a
project materializes that article, and project task create/update/review events
append durable work history to it.

The UI never substitutes mock content for explicit project wiki routes such as
`projects/{project_id}` or `team/projects/{project_id}.md`. If the article is
missing but the project exists, `GET /wiki/article` materializes the canonical
project article and returns the real markdown. If materialization fails, the UI
shows the error instead of pretending a memory page exists.

When an agent receives a project task packet, the broker includes the project
wiki path plus a bounded excerpt of the article. Agents should use that excerpt
as the first memory read for the task and call `team_wiki_read` only when the
excerpt is truncated or missing a section they need.

For coding tasks in a project with a connected GitHub repo, the task packet also
names the assigned branch and requires committed work before review or
completion. If `team_task review`, `complete`, or `approve` is called without a
`delivery_url`, the broker pushes the assigned branch and runs `gh pr create`.
The returned GitHub PR URL is verified with `gh pr view`, including PR state,
review decision, check rollup, draft state, and merge state. If PR creation or
verification fails, the task is moved to `blocked` and the failure is appended
to the project wiki instead of reporting a misleading completion.

The UI treats a repo URL as a prerequisite, not a guarantee. Before creating a
coding task, it checks that the repo URL is a GitHub repo, `gh` is installed,
`gh auth status` succeeds, and `gh repo view <owner>/<repo>` can read the default
branch. If any check fails, the project still accepts planning, documentation,
and task-breakdown requests, but it does not create `local_worktree` coding
tasks from the request box.

Coding task delivery receipts live on the task as `delivery_url`,
`delivery_summary`, `delivery_status`, `delivery_review_decision`,
`delivery_checks_status`, `delivery_merge_state`, `delivery_draft`,
`delivery_checked_at`, and `delivered_at`. A project-scoped `local_worktree`
task with a connected repo can still accept a manually supplied receipt, but the
URL must be a GitHub PR in the connected project repo and `gh pr view` must
confirm it exists. The default path is automatic PR creation from the assigned
branch. It cannot move to `done` until the PR receipt is present and verifiable;
closed, draft, changes-requested, failing-check, and merge-conflict PRs must be
fixed or replaced before completion. Delivery receipts and PR creation failures
are also appended to the project wiki work log.

Task cards expose whether a project task is planning or coding work, and review
cards prioritize actionable PR state such as missing receipt, draft, requested
changes, failing checks, merge conflicts, pending checks, open, or merged. The
task detail modal shows a compact execution progress list plus the
project-scoped activity log so humans can see owner, branch, delivery, review,
checks, merge, and completion state without reading raw broker actions.

## Status flow

The existing task states remain unchanged:

- `open`
- `in_progress`
- `review`
- `blocked`
- `done`
- `canceled`

Dragging a task between board columns still calls the existing task actions
(`claim`, `release`, `review`, `block`, `complete`, `cancel`). Projects scope
the board; they do not replace the task state machine.

## API examples

Create a project:

```bash
curl -X POST "$BROKER/projects" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Customer Portal","created_by":"human"}'
```

Create a task in a project:

```bash
curl -X POST "$BROKER/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create",
    "title": "Invite first teammate",
    "created_by": "human",
    "project_id": "customer-portal"
  }'
```

List the project board:

```bash
curl "$BROKER/tasks?all_channels=true&include_done=true&project_id=customer-portal" \
  -H "Authorization: Bearer $TOKEN"
```

## Boundaries

- This is not a full Jira clone.
- Custom workflow states are not configurable yet.
- Project permissions are currently inherited from the optional project channel.
- Billing and SaaS tenant isolation remain out of scope for this local MVP.
