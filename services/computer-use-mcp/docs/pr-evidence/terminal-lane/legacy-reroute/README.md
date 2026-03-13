# Legacy Terminal Reroute Demo

Source run:

- `airi-chat-terminal-reroute-2026-03-12T04-40-56-026Z`

What happened:

1. AIRI called `workflow_validate_workspace`.
2. The workflow started on the normal `exec` path.
3. The validation step required an interactive terminal.
4. The workflow returned a formal PTY reroute.
5. AIRI continued on PTY session `pty_2`.
6. AIRI verified the interactive fixture output and completed successfully.

Why this matters:

- this proves the old outward reroute path was real
- AIRI did not stop at receiving `workflow_reroute`
- AIRI consumed the reroute and completed the interactive task

Reviewer-safe evidence:

- `011-chat-ready.png`
- `047-post-reroute-tool-turn.png`
- `054-demo-summary.png`
