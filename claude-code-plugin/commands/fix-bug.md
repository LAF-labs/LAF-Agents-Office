---
description: Fix a bug with TDD, review, and memory capture
---

Workflow:

1. Reproduce or write the smallest failing test.
2. Ask Architect only if architecture invariants are touched.
3. Ask Coder to implement the smallest fix.
4. Ask Tester to run focused and relevant broader checks.
5. Ask Reviewer to check security, Office Rule, provider neutrality, and memory.
6. If the bug exposes an agent-workflow failure, run `/ratchet` and add the
   smallest permanent guard.
7. Capture bug signature and fix note in Notebook.

