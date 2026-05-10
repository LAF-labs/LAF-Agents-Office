---
description: Convert an observed agent-workflow failure into a permanent guard
---

Run as Reviewer or Tester after a concrete agent-workflow failure is observed.

Inputs: failure signature, reproduction, impact, touched surface, and the check
that should fail before the guard exists.

Workflow:

1. Reproduce or summarize the smallest failure signature.
2. Choose the narrowest permanent guard:
   - prompt drift -> `evals/`
   - code drift -> focused test
   - unsafe shell, secret, polling, provider, or memory drift -> hook or CI gate
   - role confusion -> role contract or command update
   - false completion -> task receipt, lifecycle, or review gate
3. Implement only that guard and the minimal supporting change.
4. Run the focused verification command.
5. Capture the failure record in Notebook and suggest Wiki promotion only after
   review.

Do not add broad rules without an observed failure signature.
