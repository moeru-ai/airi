# computer-use-mcp Agent Notes

Scope: `services/computer-use-mcp/**`

## Mission

`computer-use-mcp` is AIRI's deterministic execution substrate.

- AIRI owns planning, chat UX, approval UX, provider integration, and MCP attachment.
- `computer-use-mcp` owns execution primitives, workflow orchestration, terminal/browser/desktop surfaces, trace, audit, and safety checks.
- Treat terminal, browser, editor, and desktop operations as one task system. Do not split them into disconnected demos.

## Boundary

- Keep provider-specific behavior in `packages/stage-ui/**`.
- Keep OS execution and workflow orchestration in this package.
- The Desktop Host approval window is documented in `apps/stage-tamagotchi/README.md`.

## Agent Operating Guardrails

- Keep changes narrow and evidence-backed.
- Keep agent configuration changes separate from runtime logic changes. Update `README.md` when execution behavior changes.
- Do not touch desktop overlay, Electron bridge, Chrome extension, MCP handler registration, workspace memory, verification gate, or shell guard unless the task explicitly requires it.
- Keep planning, archive eligibility, compaction text, provider message emission, and runner semantics separate unless evidence requires a cross-layer change.
- Prefer pure helpers for shared contracts.
- Add regression tests for boundary behavior.
- Do not broaden refactors without evidence.
- Do not treat parser-level coverage as proof that projected provider messages are valid; add projector-level tests when the final message shape is the contract.

## Agent Report Checklist

- Exact files changed.
- Exact test command.
- Exit code.
- Relevant pass/fail output.
- Remaining risks and why they are out of scope.
