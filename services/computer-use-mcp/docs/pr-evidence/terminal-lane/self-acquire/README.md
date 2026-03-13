# Terminal Self-Acquire Mainline Demo

Source run:

- `airi-chat-terminal-self-acquire-2026-03-12T08-31-25-205Z`

What happened:

1. AIRI called `workflow_validate_workspace`.
2. The workflow started on `exec`.
3. The validation command matched an interactive terminal pattern.
4. The workflow self-acquired PTY `pty_1` inside the workflow.
5. The workflow completed successfully.
6. AIRI produced a final visible summary and the PTY remained readable afterward.

Why this matters:

- this is the current terminal lane mainline
- no harness-side `pty_create` was required
- no outward terminal reroute was required
- the workflow now owns the terminal surface transition itself

Reviewer-safe evidence:

- `011-chat-ready.png`
- `033-post-workflow-self-acquire-turn.png`
- `042-demo-summary.png`
