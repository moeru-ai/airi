# AIRI VSCode Plugin

> Official VSCode extension for AIRI, streaming your current working at stuff back to AIRI.

## Context slots

Document observations replace the fixed `workspace` slot. Event observations append to the fixed `events` slot.
The receiving context registry bounds the event window per writer. Event identifiers remain unique across updates.

## Verify

```sh
pnpm -F vscode-airi typecheck
pnpm -F vscode-airi exec vitest run
```
