# Terminal Lane Demo Evidence

This directory contains the reviewer-safe demo assets for the terminal lane PR.

It intentionally includes only:

- screenshots
- short written summaries

It intentionally excludes:

- runtime `stage-user-data`
- cookies / browser profile state
- raw report directories
- the 220MB local screen recording

## What Is Included

### 1. Legacy outward reroute demo

Path:

- `services/computer-use-mcp/docs/pr-evidence/terminal-lane/legacy-reroute/`

What it proves:

- AIRI started on the normal workflow `exec` path
- the workflow emitted a formal terminal reroute
- AIRI consumed that reroute and continued on PTY
- AIRI verified the interactive result on PTY

This is proof of the older:

- `exec -> workflow_reroute -> PTY`

story.

### 2. Current self-acquire mainline demo

Path:

- `services/computer-use-mcp/docs/pr-evidence/terminal-lane/self-acquire/`

What it proves:

- AIRI started on the normal workflow `exec` path
- the workflow recognized an interactive terminal requirement
- the workflow self-acquired PTY inside the workflow
- the workflow completed successfully without relying on outward terminal reroute

This is proof of the current terminal lane mainline:

- `exec -> workflow self-acquires PTY -> continue on PTY`

## Suggested Reviewer Order

If you only want to review one thing first, use the current mainline:

1. `self-acquire/011-chat-ready.png`
2. `self-acquire/033-post-workflow-self-acquire-turn.png`
3. `self-acquire/042-demo-summary.png`

Then compare with the older fallback path:

1. `legacy-reroute/011-chat-ready.png`
2. `legacy-reroute/047-post-reroute-tool-turn.png`
3. `legacy-reroute/054-demo-summary.png`

## Why Both Are Here

This PR contains both because they prove different things:

- legacy reroute proves AIRI can receive and continue from a terminal reroute
- self-acquire proves the current terminal-lane mainline is now internalized by the workflow engine

The second one is the main story for this PR.
