---
name: AI task
about: Narrow task suitable for Codex, Copilot, or another coding agent
title: "[AI task]: "
labels: ai-copilot-ok, ai-small
assignees: ""
---

## Task

One narrow task.

## Allowed scope

- Files/directories:
  - 

## Forbidden scope

- Do not touch package files or lockfiles unless explicitly required.
- Do not touch unrelated services, docs, or agent configuration.
- Do not touch security-sensitive logic unless this issue is specifically about that boundary.
- Do not broaden into architecture cleanup.

## Expected behavior

Describe the expected behavior or evidence target.

## Validation

Run the narrowest relevant command first:

```bash
pnpm -F <package-name> exec vitest run <path/to/test>
```

If runtime contracts changed, also run:

```bash
pnpm -F <package-name> typecheck
```

## Output required

- Files changed
- Commands run
- Exit codes
- Relevant pass/fail output
- Remaining risks
- Keep / revert / split recommendation
