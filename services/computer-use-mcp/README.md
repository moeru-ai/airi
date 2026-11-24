# computer-use-mcp

This package executes desktop, terminal, browser, and workflow operations for AIRI.
AIRI owns planning and the Desktop Host approval window.
This package owns execution, workflow steps, trace, and the service approval mode.

Windows observation and input use the AUV runner.
Terminal launches processes.
The Desktop Host modes `ask`, `auto`, and `full` are in `apps/stage-tamagotchi/README.md`.
They do not replace `actions`, `all`, and `never` in this service.

## Current Executor Modes

- `dry-run`
  - default
  - never injects input
  - still captures best-effort local screenshots for debugging
- `auv`
  - current Windows primary backend
  - window observation through the local AUV daemon
  - display capture and window-bound click/type/key/scroll operations
  - each mutation keeps the Host approval gate and a fresh target-window binding
- `macos-local`
  - legacy local backend
  - window observation via `NSWorkspace + CGWindowList`
  - input injection via Swift + Quartz `CGEvent`
  - app open/focus via `open -a` and `activate`
- `linux-x11`
  - retained as a legacy experimental backend
  - not the current primary backend

## Tool Surface

### Service tools and the Desktop catalog

This package exposes the tools below to a direct MCP client.
The Desktop Host's default Agent catalog is a separate decision.
That catalog, and the rule that exposure is not authorization, is in `packages/stage-ui/README.md`.

### Other direct MCP tools

The MCP protocol also exposes the focused tools below to direct clients:

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

- `browser_agent_get_status`
- `browser_agent_run`
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

## Authorization

The Desktop Host and this service use different approval settings.
One list does not replace the other.

The Host settings are `ask`, `auto`, and `full`.
They live in the desktop app and are documented in `apps/stage-tamagotchi/README.md`.
A direct MCP client does not receive that approval window.

This service reads `COMPUTER_USE_APPROVAL_MODE`:

- `actions` is the default. Mutating actions and terminal commands require approval.
- `all` requires approval for a broader set of operations.
- `never` is an explicit operator setting. It turns action approval off, including arbitrary shell commands. It does not sandbox Terminal, PTY, or CDP.

In `actions` and `all`, a caller cannot approve its own pending action or claim an approved workflow continuation.
Workflow `autoApprove` cannot weaken the server mode.
Unrestricted CDP evaluation, navigation, and delegated browser execution stay closed while the server requires approval.
`desktop_approve_pending_action` returns denied in those modes.
These restrictions are not the Desktop Host approval window.

## Execution records

Each action keeps four records separate.
`modelDecision` is the tool and arguments the model selected.
`authorization` is the policy or Host decision.
`execution` records whether the operation was dispatched and delivered.
`businessVerification` records whether the application state matches the user goal.
`contextCompaction` belongs to Core Agent, not to this package.

A delivered input is not business completion.
A command exit code of 0 is not business completion.
`execution.status` of `delivered` does not set `businessVerification.status` to `verified`.
If the response is lost after dispatch, `execution.status` is `unknown` and `doNotReplay` is true.
Another dispatch waits for a fresh observation.

## Execution lifecycle

Shell execution is not a sandbox.
Approval freezes argv and the spawn directory.
It does not freeze referenced scripts or their dependencies.
A Terminal command is not a persistent interactive shell.
The Terminal runner and the desktop executor are independent.
Command exit and output drain are separate lifecycle events.
Cancellation does not undo side effects.
Cancellation also does not prove that dispatch never happened.
On Windows, termination covers the direct shell process.
Cleanup of descendant processes is not proven.
PTY authorization is separate from ordinary command authorization.

The desktop policy boundary is narrow:

- global screen coordinates are allowed for UI actions
- `allowApps` is not used as a hard gate for click/type/scroll
- `denyApps` still blocks sensitive foreground apps
- `COMPUTER_USE_OPENABLE_APPS` only gates `desktop_open_app` and `desktop_focus_app`
- AIRI itself is in the default deny list to avoid self-operation
- terminal commands require approval in `actions` and `all` modes
- app open/focus requires approval in `actions` and `all` modes
- click/type/press/scroll still use per-action approval

`dry-run` only describes desktop input.
The AUV backend executes through the app-owned daemon and refuses stale, placeholder, or cross-window mutation attempts.
Terminal uses its own runner and is the route for launching a process that has no existing window.

## Environment Variables

Core:

- `COMPUTER_USE_EXECUTOR`
  - `dry-run`, `auv`, `macos-local`, or `linux-x11`
- `COMPUTER_USE_AUV_BINARY_PATH`
  - optional path override for the Windows AUV executable
- `COMPUTER_USE_AUV_STORE_ROOT`
  - defaults to `<COMPUTER_USE_SESSION_ROOT>/auv`
- `COMPUTER_USE_AUV_STARTUP_TIMEOUT_MS`, `COMPUTER_USE_AUV_SHUTDOWN_TIMEOUT_MS`
  - daemon lifecycle deadlines; defaults are 10000 ms and 5000 ms
- `COMPUTER_USE_APPROVAL_MODE`
  - `actions` (default), `all`, `never`
- `COMPUTER_USE_SESSION_ROOT`
  - local output directory for screenshots and `audit.jsonl`
- `COMPUTER_USE_TIMEOUT_MS`
- `COMPUTER_USE_DEFAULT_CAPTURE_AFTER`
- `COMPUTER_USE_MAX_OPERATIONS`
- `COMPUTER_USE_MAX_OPERATION_UNITS`
- `COMPUTER_USE_MAX_PENDING_ACTIONS`

Host control:

- `AIRI_TRUSTED_TERMINAL` and `AIRI_HOST_TERMINAL_NONCE`
  - private Terminal approval connection. It only authorizes `terminal_exec`.
- `AIRI_TRUSTED_COMPUTER_USE` and `AIRI_HOST_COMPUTER_USE_NONCE`
  - private Computer Use approval connection. It authorizes approved desktop and browser mutations without requiring Terminal control.

Desktop orchestration:

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

Autonomous browser agent:

- `COMPUTER_USE_BROWSER_AGENT_ROOT`
  - optional override for the embedded browser-agent workspace under `src/bin/computer_use`
- `COMPUTER_USE_PYTHON`
  - optional python executable override for `browser_agent_run`; defaults to the embedded `.venv/bin/python` when present, otherwise `python3`

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

## Getting started

AIRI still connects through `mcp.json`.
Example Windows AUV entry:

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
        "COMPUTER_USE_EXECUTOR": "auv",
        "COMPUTER_USE_APPROVAL_MODE": "actions",
        "COMPUTER_USE_OPENABLE_APPS": "Terminal,Cursor,Google Chrome"
      }
    }
  }
}
```

The Desktop Host binds a private credential and uses its own approval window.
An external MCP client does not receive that window.
In `actions` and `all`, `desktop_approve_pending_action` still returns denied.

For browser DOM automation, `computer-use-mcp` also exposes a local WebSocket bridge that matches the user's Chrome extension bridge pattern:

1. `computer-use-mcp` listens on `ws://127.0.0.1:8765` by default
2. the unpacked browser extension background service worker connects to that socket
3. AIRI can then call `browser_dom_*` MCP tools against the active browser tab

If you override `COMPUTER_USE_BROWSER_DOM_BRIDGE_HOST` or
`COMPUTER_USE_BROWSER_DOM_BRIDGE_PORT`, mirror the same endpoint in the Chrome
extension via `chrome.storage.local.set({ browserDomBridgeHost, browserDomBridgePort })`
so the background worker reconnects to the correct socket.

Use the two surfaces differently:

- `desktop_*` for AIRI itself, native macOS apps, Electron windows, Finder, Terminal, VS Code
- `browser_dom_*` for real browser pages, cross-frame DOM reads, form filling, selector-based interaction, and iframe-heavy flows
- `browser_agent_run` for goal-driven browser tasks where AIRI should delegate the web exploration loop instead of manually hard-coding each browser step

## Development

- `pnpm -F @proj-airi/computer-use-mcp typecheck`
- `pnpm -F @proj-airi/computer-use-mcp test`
- `pnpm -F @proj-airi/computer-use-mcp smoke:stdio`
- `pnpm -F @proj-airi/computer-use-mcp smoke:macos`
- `pnpm -F @proj-airi/computer-use-mcp e2e:airi-chat`
- `pnpm -F @proj-airi/computer-use-mcp e2e:airi-discord`

Legacy remote validation remains available:

- `pnpm -F @proj-airi/computer-use-mcp bootstrap:remote`
- `pnpm -F @proj-airi/computer-use-mcp smoke:remote`

## Known limitations

- A complete real-model Agent task is not accepted evidence. Unit tests, an MCP handshake, and an HTTP 200 response do not replace that run.
- On Windows, direct-shell termination does not prove descendant-process cleanup.
- There is no accessibility-tree grounding yet.
- There is no multi-monitor orchestration policy yet.
- Global coordinates are allowed. The safety boundary is approval and audit, not strict app isolation.
- PTY support and ordinary command approval stay separate. Legacy outward terminal reroute is secondary.
