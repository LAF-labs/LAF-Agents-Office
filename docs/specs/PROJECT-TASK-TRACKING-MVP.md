# Project Task Tracking MVP

LAF-Office now treats projects as first-class task scopes. The MVP keeps the existing
office task lifecycle and adds a lightweight Jira-style project filter on top.

## What ships

- `POST /projects` creates an active project.
- `GET /projects` lists active projects visible to the viewer.
- `POST /tasks` accepts `project_id` when creating or updating a task.
- `GET /tasks?project_id=<id>` returns only tasks for that project.
- The Tasks app can create projects, switch between projects, and show project
  labels on task cards.

## Project Memory Contract

Every project owns a wiki article at `team/projects/{project_id}.md`. Creating a
project materializes that article, and project task create/update/review events
append durable work history to it.

When an agent receives a project task packet, the broker includes the project
wiki path plus a bounded excerpt of the article. Agents should use that excerpt
as the first memory read for the task and call `team_wiki_read` only when the
excerpt is truncated or missing a section they need.

For coding tasks in a project with a connected GitHub repo, the task packet also
names the assigned branch and requires the agent to open a GitHub PR before
marking the task complete.

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
