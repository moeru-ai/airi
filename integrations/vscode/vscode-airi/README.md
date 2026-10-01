# AIRI VSCode Plugin

> Official VSCode extension for AIRI, streaming your current working at stuff back to AIRI.

## Context slots

Document observations replace the fixed `workspace` slot. Event observations append to the fixed `events` slot.
The receiving context registry bounds the event window per writer. Event identifiers remain unique across updates.
Text over 80 tokens becomes a `vscode:context` source reference. Full details stay in the extension.
`Client.getContext()` reads the current workspace or one of the eight retained events. Disconnect clears these records.
Origin references do not grant tool or read permissions. Cross-module retrieval requires a separate authorized query boundary.

## Verify

```sh
pnpm -F vscode-airi typecheck
pnpm -F vscode-airi exec vitest run
```
