# ADR 0001: MCP IPC trust boundary

- Status: Proposed
- Date: 2026-09-15

## Context

All AIRI desktop windows share one preload bridge. `apps/stage-tamagotchi/src/preload/shared.ts` exposes the `@electron-toolkit/preload` `electronAPI`, which includes `ipcRenderer`, to every renderer. Every window also runs with `sandbox: false`.

The MCP service (`apps/stage-tamagotchi/src/main/services/airi/mcp-servers/index.ts`) starts child processes from `mcp.json` and from renderer payloads (`testServer`). Any renderer that can invoke IPC can start a local program with the user's privileges.

`assertTrustedMcpSender` rejects calls that do not come from a window main frame. The guard blocks subframes. It cannot separate a compromised first-party renderer from a healthy one.

## Decision

Harden the boundary in two steps.

1. Narrow the preload surface. Expose a minimal `ipcRenderer` wrapper with only the methods Eventa and the app use. Do not expose `webFrame` or `process`.
2. Require a user action for MCP process start. Restrict `writeConfigText` and `testServer` to the settings window, or add a main-process confirmation before the first start of one command.

## Options

| Option | Benefit | Cost |
| --- | --- | --- |
| Narrow preload only | Removes unused native surface | Does not stop a compromised renderer that needs `ipcRenderer` |
| Settings window only for writes and tests | Clear owner for process start | The overlay readiness contract calls `applyAndRestart`; keep that path open |
| Native confirmation for new commands | The user sees the command | Breaks unattended automation without a bypass flag |
| Permission broker per server | Strongest control | New subsystem with no current owner |

## Recommendation

Do both step 1 and step 2.

- Step 1 is a small change with no behavior loss.
- Step 2 keeps `electronMcpListTools`, `electronMcpCallTool`, `electronMcpGetRuntimeStatus`, and `electronMcpApplyAndRestart` open to app windows. Only config writes and draft server tests move to the settings window.

## Consequences

- Renderer code that reads `window.electron.webFrame` or `window.electron.process` must move behind an explicit IPC call.
- The desktop overlay readiness contract keeps `applyAndRestartMcp`.
- Tests that start MCP servers must not depend on a dialog. Prefer a settings-window guard over a confirmation dialog.

## Removal

Revisit this decision when Eventa supports window-scoped capability tokens.
