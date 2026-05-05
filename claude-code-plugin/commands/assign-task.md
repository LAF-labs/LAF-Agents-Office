---
description: Assign task-board work to a LAF agent
---

Inputs: task title, owner agent, reviewer, acceptance criteria, checks.

Workflow:

1. Convert the request into a task with clear outcome and verification.
2. Create or update the board item:
   `/task create --title "<title>" --description "<scope and checks>" --assignees <agent-slug>`
3. Mention the owner agent in the office channel.
4. Reviewer and Tester must record checks before completion.
5. Durable lessons go to Notebook.

