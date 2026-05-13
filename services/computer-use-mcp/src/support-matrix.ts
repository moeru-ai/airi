/**
 * Machine-executable support matrix for the computer-use-mcp service.
 *
 * Every capability the service claims to support is listed here with its
 * current verification level. Only items at `product-supported` may be
 * described externally as "supported".
 *
 * Levels:
 * - `implemented` — code exists, no verification guarantee
 * - `covered` — code + unit/integration or smoke test
 * - `product-supported` — code + test + real happy-path script
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SupportLevel = 'implemented' | 'covered' | 'product-supported'

export type Lane = 'workflow' | 'browser' | 'desktop-native' | 'handoff' | 'terminal'

export interface SupportMatrixEntry {
  /** Which lane this capability belongs to. */
  lane: Lane
  /** Unique identifier for the capability. */
  id: string
  /** Human-readable label. */
  label: string
  /** Current verification level. */
  level: SupportLevel
  /** Vitest include pattern(s) that cover this item. */
  unitTests?: string[]
  /** CLI command to run the smoke test. */
  smokeCommand?: string
  /** Prose description of the happy-path (demo=regression). */
  happyPath?: string
}

export const strictReleaseGateCommands = [
  'pnpm -F @proj-airi/computer-use-mcp e2e:developer-workflow',
  'pnpm -F @proj-airi/computer-use-mcp e2e:terminal-exec',
  'pnpm -F @proj-airi/computer-use-mcp e2e:terminal-pty',
  'pnpm -F @proj-airi/computer-use-mcp e2e:terminal-self-acquire',
  'pnpm -F @proj-airi/computer-use-mcp e2e:airi-chat-terminal-self-acquire',
] as const

// ---------------------------------------------------------------------------
// Matrix entries
// ---------------------------------------------------------------------------

export const supportMatrix: SupportMatrixEntry[] = [
  // ── Workflow lane ──────────────────────────────────────────────────────
  {
    lane: 'workflow',
    id: 'workflow_open_workspace',
    label: 'Open workspace in IDE via Finder + app launch',
    level: 'product-supported',
    unitTests: [
      'src/workflows/engine.test.ts',
      'src/server/workflow-formatter.test.ts',
    ],
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp e2e:developer-workflow',
    happyPath: 'open_workspace → validate_workspace → run_tests (e2e:developer-workflow, dry-run)',
  },
  {
    lane: 'workflow',
    id: 'workflow_validate_workspace',
    label: 'Confirm pwd + inspect changes + run validation command',
    level: 'product-supported',
    unitTests: [
      'src/workflows/engine.test.ts',
      'src/server/workflow-formatter.test.ts',
    ],
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp e2e:developer-workflow',
    happyPath: 'open_workspace → validate_workspace → run_tests (e2e:developer-workflow, dry-run)',
  },
  {
    lane: 'workflow',
    id: 'workflow_run_tests',
    label: 'Run test command in terminal via workflow engine',
    level: 'product-supported',
    unitTests: [
      'src/workflows/engine.test.ts',
      'src/server/workflow-formatter.test.ts',
    ],
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp e2e:developer-workflow',
    happyPath: 'open_workspace → validate_workspace → run_tests (e2e:developer-workflow, dry-run)',
  },
  {
    lane: 'workflow',
    id: 'workflow_inspect_failure',
    label: 'Inspect IDE failure panel via accessibility',
    level: 'covered',
    unitTests: ['src/workflows/engine.test.ts'],
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp smoke:workflow',
  },
  {
    lane: 'workflow',
    id: 'workflow_resume',
    label: 'Resume paused workflow after approval',
    level: 'covered',
    unitTests: ['src/workflows/engine.test.ts'],
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp smoke:workflow',
  },
  {
    lane: 'workflow',
    id: 'workflow_reroute_contract',
    label: 'Stable outward reroute contract (structuredContent)',
    level: 'covered',
    unitTests: [
      'src/server/workflow-formatter.test.ts',
    ],
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp e2e:browser-reroute',
    happyPath: 'workflow_browse_and_act → reroute detected → suggestedTool succeeds (secondary regression)',
  },

  // ── Browser lane ───────────────────────────────────────────────────────
  {
    lane: 'browser',
    id: 'browser_reroute_dual_stack',
    label: 'Browser DOM/CDP dual-stack reroute with surface selection',
    level: 'covered',
    unitTests: [
      'src/strategy.test.ts',
      'src/server/workflow-formatter.test.ts',
    ],
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp e2e:browser-reroute',
    happyPath: 'Dual-stack browser selection is covered by strategy/formatter tests; secondary reroute regression remains surface-agnostic under dry-run.',
  },
  {
    lane: 'browser',
    id: 'browser_surface_availability',
    label: 'Browser surface availability model (availableSurfaces/preferredSurface)',
    level: 'covered',
    unitTests: [
      'src/strategy.test.ts',
      'src/server/workflow-formatter.test.ts',
    ],
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp smoke:workflow',
  },
  {
    lane: 'browser',
    id: 'workflow_browse_and_act',
    label: 'Browser workflow orchestration',
    level: 'covered',
    unitTests: ['src/workflows/engine.test.ts'],
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp smoke:workflow',
  },

  // ── Desktop/native lane ────────────────────────────────────────────────
  {
    lane: 'desktop-native',
    id: 'desktop_focus_screenshot_accessibility',
    label: 'Focus app + screenshot + accessibility observation',
    level: 'covered',
    unitTests: ['src/server/action-executor.test.ts'],
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp smoke:stdio',
    happyPath: 'focus app → screenshot → accessibility_snapshot basic loop',
  },
  {
    lane: 'desktop-native',
    id: 'desktop_v3_chrome_grounding',
    label: 'Desktop v3 Chrome grounding smoke (ensure / observe / click / state)',
    level: 'covered',
    unitTests: [
      'src/bin/smoke-chrome-grounding.test.ts',
      'src/server/register-chrome-session.test.ts',
      'src/server/register-desktop-grounding.test.ts',
      'src/server/register-desktop-grounding-tools.test.ts',
    ],
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp smoke:desktop-v3',
    happyPath: 'desktop_ensure_chrome → desktop_observe → desktop_click_target → desktop_get_state updates grounding and pointer state',
  },
  {
    lane: 'desktop-native',
    id: 'desktop_browser_dom_route_contract',
    label: 'Browser-dom route contract (left single-click, fail-closed bridge responses)',
    level: 'covered',
    unitTests: [
      'src/browser-action-router.test.ts',
      'src/browser-dom/extension-bridge.test.ts',
    ],
  },
  {
    lane: 'desktop-native',
    id: 'desktop_click_type_press',
    label: 'Native mouse click / keyboard type / key press',
    level: 'implemented',
    unitTests: ['src/server/action-executor.test.ts'],
  },
  {
    lane: 'desktop-native',
    id: 'desktop_scroll_observe_windows',
    label: 'Scroll + observe windows',
    level: 'implemented',
  },
  {
    lane: 'desktop-native',
    id: 'desktop_approval_queue',
    label: 'Approval queue (list / approve / reject pending actions)',
    level: 'covered',
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp smoke:workflow',
  },
  {
    lane: 'desktop-native',
    id: 'task_memory_mvp',
    label: 'Task memory persistence across sessions',
    level: 'covered',
    unitTests: ['src/state.test.ts'],
  },

  // ── Terminal lane ───────────────────────────────────────────────────────
  {
    lane: 'terminal',
    id: 'terminal_exec',
    label: 'One-shot non-interactive command execution (exec surface)',
    level: 'product-supported',
    unitTests: [
      'src/server/action-executor.test.ts',
      'src/workflows/engine.test.ts',
      'src/terminal-release-gates.test.ts',
    ],
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp e2e:terminal-exec',
    happyPath: 'terminal_exec happy path: run command, capture stdout/stderr/exitCode, update run-state',
  },
  {
    lane: 'terminal',
    id: 'terminal_pty',
    label: 'Interactive PTY session lifecycle (pty surface)',
    level: 'product-supported',
    unitTests: [
      'src/server/register-pty.test.ts',
      'src/server/register-pty-terminal-lane.test.ts',
      'src/workflows/engine.test.ts',
      'src/server/workflow-prep-tools.test.ts',
      'src/terminal-release-gates.test.ts',
    ],
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp e2e:airi-chat-terminal-self-acquire',
    happyPath: 'AIRI chat validates the repo → workflow self-acquires PTY for vim --version → PTY remains readable and run-state / audit / bindings stay consistent',
  },
  {
    lane: 'terminal',
    id: 'terminal_exec_to_pty_reroute',
    label: 'exec → pty reroute when interactive session detected (legacy fallback)',
    level: 'covered',
    unitTests: [
      'src/strategy.test.ts',
      'src/workflows/engine.test.ts',
      'src/terminal-release-gates.test.ts',
    ],
    happyPath: 'run_command step hits TUI → strategy emits use_pty_surface → workflow reroutes to PTY (secondary; v2 self-acquire is primary)',
  },
  {
    lane: 'terminal',
    id: 'terminal_auto_surface_resolution',
    label: 'Auto surface resolution (exec/auto/pty mode, 4 fixed auto conditions)',
    level: 'covered',
    unitTests: [
      'src/workflows/surface-resolver.test.ts',
      'src/terminal/interactive-patterns.test.ts',
    ],
    happyPath: 'step with mode=auto → surface resolver checks bound session / interaction / patterns → selects exec or pty',
  },
  {
    lane: 'terminal',
    id: 'terminal_pty_self_acquire',
    label: 'Workflow self-acquires PTY via unified approval (no outward reroute)',
    level: 'product-supported',
    unitTests: [
      'src/workflows/engine.test.ts',
      'src/server/workflow-prep-tools.test.ts',
    ],
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp e2e:airi-chat-terminal-self-acquire',
    happyPath: 'workflow_validate_workspace starts on exec, self-acquires PTY for the interactive validation step, and completes without harness-side pty_create',
  },
  {
    lane: 'terminal',
    id: 'terminal_pty_step_family',
    label: 'In-workflow PTY step family (send_input / read_screen / wait_for_output / destroy)',
    level: 'covered',
    unitTests: [
      'src/workflows/engine.test.ts',
    ],
    happyPath: 'pty_send_input / pty_read_screen / pty_wait_for_output / pty_destroy_session execute inside workflow engine',
  },
  {
    lane: 'terminal',
    id: 'terminal_pty_open_grant',
    label: 'PTY Open Grant approval model (pty_create → session-scoped grant)',
    level: 'covered',
    unitTests: [
      'src/server/register-pty.test.ts',
    ],
  },
  {
    lane: 'terminal',
    id: 'terminal_pty_audit',
    label: 'PTY audit logging (create/send_input/read_screen/resize/destroy)',
    level: 'covered',
    unitTests: [
      'src/server/register-pty.test.ts',
    ],
  },
  {
    lane: 'terminal',
    id: 'terminal_vscode_controller',
    label: 'VS Code CLI controller (open/file/task/problems)',
    level: 'covered',
    unitTests: [
      'src/server/register-vscode.test.ts',
    ],
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp smoke:stdio',
  },
  {
    lane: 'terminal',
    id: 'terminal_step_binding',
    label: 'Workflow step terminal binding (taskId + stepId + surface)',
    level: 'covered',
    unitTests: [
      'src/workflows/engine.test.ts',
    ],
  },

  // ── Handoff lane ───────────────────────────────────────────────────────
  {
    lane: 'handoff',
    id: 'secret_read_env_value',
    label: 'Read .env secrets without terminal echo',
    level: 'covered',
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp smoke:stdio',
  },
  {
    lane: 'handoff',
    id: 'clipboard_read_write',
    label: 'Clipboard read/write text handoff',
    level: 'covered',
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp smoke:stdio',
  },
  {
    lane: 'handoff',
    id: 'reroute_consumer_stage_ui',
    label: 'Reroute consumption in stage-ui (mcp.ts + llm-tool-loop)',
    level: 'covered',
    unitTests: [
      'packages/stage-ui/src/tools/mcp-reroute.test.ts',
      'packages/stage-ui/src/tools/mcp.test.ts',
    ],
    smokeCommand: 'pnpm exec vitest run packages/stage-ui/src/tools/mcp-reroute.test.ts packages/stage-ui/src/tools/mcp.test.ts',
    happyPath: 'MCP returns reroute → stage-ui parser extracts → fixed template observation → provider paths consume the same reroute signal in tests',
  },
]

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export function getProductSupported(): SupportMatrixEntry[] {
  return supportMatrix.filter(entry => entry.level === 'product-supported')
}

export function getByLane(lane: Lane): SupportMatrixEntry[] {
  return supportMatrix.filter(entry => entry.lane === lane)
}

export function getLaneHappyPath(lane: Lane): SupportMatrixEntry | undefined {
  return supportMatrix.find(entry => entry.lane === lane && entry.happyPath)
}

/**
 * Verify every `product-supported` entry has the full verification triple.
 * Returns failing entries (empty array = all good).
 */
export function validateProductSupported(): SupportMatrixEntry[] {
  return getProductSupported().filter(
    entry => !entry.unitTests?.length || !entry.smokeCommand || !entry.happyPath,
  )
}

/**
 * Verify every `product-supported` entry points at an approved strict gate
 * rather than a loose smoke or unit-test-only command.
 */
export function validateProductSupportedStrictGates(): SupportMatrixEntry[] {
  const strictGateSet = new Set<string>(strictReleaseGateCommands)
  return getProductSupported().filter(entry => !entry.smokeCommand || !strictGateSet.has(entry.smokeCommand))
}
