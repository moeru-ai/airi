# computer-use-mcp

AIRI-specific macOS desktop orchestration MCP service.

## What It Is

This package is no longer positioned as a generic remote computer-use experiment.
The current v1 shape is:

- AIRI keeps the control plane:
  - MCP tool surface
  - approval queue protocol
  - audit log
  - trace history
  - screenshot persistence
- `computer-use-mcp` provides a local macOS execution layer:
  - window observation
  - screenshots
  - app open/focus
  - mouse/keyboard injection
  - background terminal command execution
- AIRI desktop adds a native approval adapter:
  - `approval_required` still comes from MCP
  - Electron shows a native dialog
  - AIRI automatically calls approve/reject on the user's behalf

The intended story is:

- AIRI uses tools first
- visual observation is supplementary, not the primary execution path
- terminal commands are executed by a background shell runner, not by scripting Terminal tabs

## Current Executor Modes

- `dry-run`
  - default
  - never injects input
  - still captures best-effort local screenshots for debugging
- `macos-local`
  - current primary backend
  - window observation via `NSWorkspace + CGWindowList`
  - input injection via Swift + Quartz `CGEvent`
  - app open/focus via `open -a` and `activate`
- `linux-x11`
  - retained as a legacy experimental backend
  - not the main v1 story anymore

## Tool Surface

Desktop observation and control:

- `desktop_get_capabilities`
- `desktop_observe_windows`
- `desktop_screenshot`
- `desktop_open_app`
- `desktop_focus_app`
- `desktop_click`
- `desktop_type_text`
- `desktop_press_keys`
- `desktop_scroll`
- `desktop_wait`

Terminal orchestration:

- `terminal_exec`
- `terminal_get_state`
- `terminal_reset_state`

Approval and audit helpers:

- `desktop_list_pending_actions`
- `desktop_approve_pending_action`
- `desktop_reject_pending_action`
- `desktop_get_session_trace`

## Policy Model

The current macOS v1 boundary is intentionally narrow and explicit:

- global screen coordinates are allowed for UI actions
- `allowApps` is not used as a hard gate for click/type/scroll
- `denyApps` still blocks sensitive foreground apps
- `COMPUTER_USE_OPENABLE_APPS` only gates `desktop_open_app` and `desktop_focus_app`
- AIRI itself is in the default deny list to avoid self-operation
- terminal commands always require approval
- app open/focus always require approval
- click/type/press/scroll still use per-action approval

## Environment Variables

Core:

- `COMPUTER_USE_EXECUTOR`
  - `dry-run`, `macos-local`, or `linux-x11`
- `COMPUTER_USE_APPROVAL_MODE`
  - `actions` (default), `all`, `never`
- `COMPUTER_USE_SESSION_ROOT`
  - local output directory for screenshots and `audit.jsonl`
- `COMPUTER_USE_TIMEOUT_MS`
- `COMPUTER_USE_DEFAULT_CAPTURE_AFTER`
- `COMPUTER_USE_MAX_OPERATIONS`
- `COMPUTER_USE_MAX_OPERATION_UNITS`
- `COMPUTER_USE_MAX_PENDING_ACTIONS`

macOS orchestration:

- `COMPUTER_USE_OPENABLE_APPS`
  - default `Terminal,Cursor,Google Chrome`
- `COMPUTER_USE_DENY_APPS`
  - default includes `1Password`, `Keychain`, `System Settings`, `Activity Monitor`, `AIRI`
- `COMPUTER_USE_DENY_WINDOW_TITLES`
- `COMPUTER_USE_TERMINAL_SHELL`
  - default current shell, otherwise `/bin/zsh`
- `COMPUTER_USE_ALLOWED_BOUNDS`
  - optional global coordinate clamp

Legacy remote runner:

- `COMPUTER_USE_REMOTE_SSH_HOST`
- `COMPUTER_USE_REMOTE_SSH_USER`
- `COMPUTER_USE_REMOTE_SSH_PORT`
- `COMPUTER_USE_REMOTE_RUNNER_COMMAND`
- `COMPUTER_USE_REMOTE_DISPLAY_SIZE`
- `COMPUTER_USE_REMOTE_OBSERVATION_BASE_URL`
- `COMPUTER_USE_REMOTE_OBSERVATION_SERVE_PORT`
- `COMPUTER_USE_REMOTE_OBSERVATION_TOKEN`

Binary overrides:

- `COMPUTER_USE_SWIFT_BINARY`
- `COMPUTER_USE_OSASCRIPT_BINARY`
- `COMPUTER_USE_SCREENSHOT_BINARY`
- `COMPUTER_USE_OPEN_BINARY`
- `COMPUTER_USE_SSH_BINARY`
- `COMPUTER_USE_TAR_BINARY`

## AIRI Integration

AIRI still connects through `mcp.json`.
Example local macOS entry:

```json
{
  "mcpServers": {
    "computer_use": {
      "command": "pnpm",
      "args": [
        "-F",
        "@proj-airi/computer-use-mcp",
        "start"
      ],
      "cwd": "/Users/liuziheng/airi",
      "env": {
        "COMPUTER_USE_EXECUTOR": "macos-local",
        "COMPUTER_USE_APPROVAL_MODE": "actions",
        "COMPUTER_USE_OPENABLE_APPS": "Terminal,Cursor,Google Chrome"
      }
    }
  }
}
```

On the AIRI desktop side, approvals are handled like this:

1. model calls a `computer_use::*` tool
2. MCP returns `approval_required`
3. Electron shows a native approval dialog
4. AIRI automatically calls `desktop_approve_pending_action` or `desktop_reject_pending_action`
5. terminal/app approvals can be reused for the current run only

## Validation Commands

- `pnpm -F @proj-airi/computer-use-mcp typecheck`
- `pnpm -F @proj-airi/computer-use-mcp test`
- `pnpm -F @proj-airi/computer-use-mcp smoke:stdio`
- `pnpm -F @proj-airi/computer-use-mcp smoke:macos`

Legacy remote validation remains available:

- `pnpm -F @proj-airi/computer-use-mcp bootstrap:remote`
- `pnpm -F @proj-airi/computer-use-mcp smoke:remote`

## Known Limits

- macOS only for the main v1 path
- no accessibility tree grounding yet
- no PTY/TUI terminal support
- no multi-monitor orchestration policy yet
- global coordinates are allowed, so the safety boundary is approval + audit, not strict app isolation
