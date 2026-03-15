# computer-use-mcp

AIRI-specific macOS desktop orchestration MCP service.

## Why This Exists

This package exists because AIRI already has many useful pieces in the monorepo —
providers, chat UX, MCP attachment, desktop app surfaces, browser integrations,
tool bridges, and workflow-related logic — but those pieces are still too easy to
use as isolated features instead of one coherent agent system.

`computer-use-mcp` is the missing execution substrate for that gap.

The current goal is not to add "another computer use demo". The goal is to give
AIRI a unified way to:

- observe the current desktop or browser state
- choose the right execution surface for the task
- run deterministic actions through tools and terminal commands
- keep approvals, trace, and audit artifacts attached to the run
- compose those actions into repeatable workflows instead of one-off demos

In short:

- AIRI remains the control plane and agent shell
- `computer-use-mcp` is the local execution and workflow substrate
- the value is in orchestration, not in cursor movement by itself

## Coding Layer Release Posture

The coding layer inside `computer-use-mcp` should currently be understood as a
**minimal integrated implementation**, not as a Codex-equivalent coding agent.

What that means in practice:

- it is already real enough to ship behind AIRI and support real workflows
- it has planner / diagnosis / benchmark / smoke coverage, not just demos
- it is still intentionally bounded and conservative
- post-launch hardening and capability polish are expected, not accidental

The current release goal is:

- ship a usable coding kernel
- prove it with tests, E2E, smoke, and benchmark gates
- continue iterative polishing after the first integration lands

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
- desktop/Electron/native apps and browser DOM are treated as different execution surfaces

## Why It Is Not "Just A Mouse Toy"

This package should not be understood as a coordinate-replay automation toy.

What makes it different:

- it exposes an MCP tool surface instead of a one-off macro recorder
- it keeps action policy, approval, trace history, and audit output per run
- it distinguishes between desktop control and browser DOM control instead of forcing everything through blind clicks
- it prefers deterministic execution paths (`terminal_exec`, workflows, `browser_dom_*`) before raw coordinate actions
- it is designed to be called by AIRI automatically as part of a task flow, not merely driven by a human demo operator

That means the package is useful only when it helps AIRI turn scattered local
capabilities into one observable, controllable task system.

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

Clipboard bridge:

- `secret_read_env_value`
- `clipboard_read_text`
- `clipboard_write_text`

Browser DOM bridge:

- `browser_dom_get_bridge_status`
- `browser_dom_get_active_tab`
- `browser_dom_read_page`
- `browser_dom_find_elements`
- `browser_dom_click`
- `browser_dom_read_input_value`
- `browser_dom_set_input_value`
- `browser_dom_check_checkbox`
- `browser_dom_select_option`
- `browser_dom_wait_for_element`
- `browser_dom_get_element_attributes`
- `browser_dom_get_computed_styles`
- `browser_dom_trigger_event`

Approval and audit helpers:

- `desktop_list_pending_actions`
- `desktop_approve_pending_action`
- `desktop_reject_pending_action`
- `desktop_get_session_trace`

Workflow orchestration:

- `workflow_open_workspace`
  - reveals a workspace in Finder and opens it in the configured IDE
- `workflow_validate_workspace`
  - opens the workspace, confirms `pwd`, inspects local changes, and runs a validation command such as `pnpm typecheck`
- `workflow_run_tests`
  - runs a test command from the workspace root
- `workflow_inspect_failure`
  - focuses the IDE and re-runs or inspects a failing command path
- `workflow_browse_and_act`
  - generic browse-and-act flow for app observation and follow-up actions
- `workflow_resume`
  - resumes a workflow that paused on `approval_required`

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

Browser DOM bridge:

- `COMPUTER_USE_BROWSER_DOM_BRIDGE_ENABLED`
  - default `true`
- `COMPUTER_USE_BROWSER_DOM_BRIDGE_HOST`
  - default `127.0.0.1`
- `COMPUTER_USE_BROWSER_DOM_BRIDGE_PORT`
  - default `8765`
- `COMPUTER_USE_BROWSER_DOM_BRIDGE_TIMEOUT_MS`
  - default `10000`

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
      "cwd": "/path/to/your/airi/repo",
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

For browser DOM automation, `computer-use-mcp` also exposes a local WebSocket bridge that matches the user's Chrome extension bridge pattern:

1. `computer-use-mcp` listens on `ws://127.0.0.1:8765` by default
2. the unpacked browser extension connects from its offscreen document
3. AIRI can then call `browser_dom_*` MCP tools against the active browser tab

Use the two surfaces differently:

- `desktop_*` for AIRI itself, native macOS apps, Electron windows, Finder, Terminal, VS Code
- `browser_dom_*` for real browser pages, cross-frame DOM reads, form filling, selector-based interaction, and iframe-heavy flows

## Validation Commands

- `pnpm -F @proj-airi/computer-use-mcp typecheck`
- `pnpm -F @proj-airi/computer-use-mcp test`
- `pnpm -F @proj-airi/computer-use-mcp smoke:stdio`
- `pnpm -F @proj-airi/computer-use-mcp smoke:macos`
- `pnpm -F @proj-airi/computer-use-mcp e2e:airi-chat`
- `pnpm -F @proj-airi/computer-use-mcp e2e:airi-discord`

Legacy remote validation remains available:

- `pnpm -F @proj-airi/computer-use-mcp bootstrap:remote`
- `pnpm -F @proj-airi/computer-use-mcp smoke:remote`

`bootstrap:remote` now defaults to dependency validation only. If the remote host
is missing required X11/desktop runner packages, install them manually or rerun
with `COMPUTER_USE_REMOTE_ALLOW_PACKAGE_INSTALL=1` to explicitly allow
`apt-get` installation via passwordless sudo.

## Demo Story To Record

If you want to record a convincing demo, show the system as an orchestrated task
runner instead of a flashy cursor dance.

Recommended recording structure:

1. Show the AIRI desktop window, a terminal, and the generated report directory.
2. Start the local AIRI desktop app and the `computer-use-mcp` service.
3. Show that AIRI can call the MCP tools automatically instead of only listing them.
4. Demonstrate one short task that exercises the full loop:
  - observe state
  - execute a tool or workflow
  - produce a visible result
  - persist trace / audit / screenshots
5. End by opening the generated `report.json`, `audit.jsonl`, or screenshots so the demo finishes with evidence rather than just screen motion.

Good first demos:

- open a workspace, confirm `pwd`, inspect local changes, and run `pnpm typecheck`
- create and run a Python hello-world project through `terminal_exec`
- use desktop control for AIRI or native apps and use `browser_dom_*` only when the task truly moves into a browser page

### Discord integration demo

For a management-readable AIRI demo, the Discord settings flow is more representative than a generic hello-world reply:

1. start AIRI desktop and `services/discord-bot`
2. open `/settings/modules/messaging-discord`
3. enable the module and save settings
4. verify that the Discord bot receives the forwarded config from AIRI and reconnects itself
5. finish by opening `report.json`, screenshots, audit log, and `discord-bot.log`

Notes:

- for a pure local-secret run, set `AIRI_E2E_DISCORD_TOKEN`
- for a more agentic run, set `AIRI_E2E_DISCORD_TOKEN_SOURCE=portal` or `auto` and let AIRI retrieve the token from the live browser / Discord Developer Portal session
- `clipboard_read_text` / `clipboard_write_text` are the intended bridge when AIRI must move a copied token from the browser back into AIRI settings
- the observable harness keeps the token out of the desktop audit trail by applying the secret through the renderer instead of typing it through Quartz key events
- if you only want to validate the AIRI → Discord bot configuration plumbing without a real token, set `AIRI_E2E_DISCORD_ALLOW_LOGIN_FAILURE=true`

Less convincing demos:

- long videos of coordinate clicking with no trace output
- browser form-filling done only by screen coordinates when DOM tools were available
- tasks that cannot explain afterwards what the agent observed, executed, or verified

## Known Limits

- macOS only for the main v1 path
- no accessibility tree grounding yet
- PTY/TUI terminal support is product-supported on the self-acquire mainline; legacy outward terminal reroute remains secondary
- no multi-monitor orchestration policy yet
- global coordinates are allowed, so the safety boundary is approval + audit, not strict app isolation
