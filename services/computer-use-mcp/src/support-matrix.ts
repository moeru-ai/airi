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

export type Lane = 'browser' | 'desktop-native' | 'handoff' | 'terminal' | 'workflow'

export type SupportLevel = 'covered' | 'implemented' | 'product-supported'

export interface SupportMatrixEntry {
  /** Prose description of the happy-path (demo=regression). */
  happyPath?: string
  /** Unique identifier for the capability. */
  id: string
  /** Human-readable label. */
  label: string
  /** Which lane this capability belongs to. */
  lane: Lane
  /** Current verification level. */
  level: SupportLevel
  /** CLI command to run the smoke test. */
  smokeCommand?: string
  /** Vitest include pattern(s) that cover this item. */
  unitTests?: string[]
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
    happyPath: 'open_workspace → validate_workspace → run_tests (e2e:developer-workflow, dry-run)',
    id: 'workflow_open_workspace',
    label: 'Open workspace in IDE via Finder + app launch',
    lane: 'workflow',
    level: 'product-supported',
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp e2e:developer-workflow',
    unitTests: [
      'src/workflows/engine.test.ts',
      'src/server/workflow-formatter.test.ts',
    ],
  },
  {
    happyPath: 'open_workspace → validate_workspace → run_tests (e2e:developer-workflow, dry-run)',
    id: 'workflow_validate_workspace',
    label: 'Confirm pwd + inspect changes + run validation command',
    lane: 'workflow',
    level: 'product-supported',
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp e2e:developer-workflow',
    unitTests: [
      'src/workflows/engine.test.ts',
      'src/server/workflow-formatter.test.ts',
    ],
  },
  {
    happyPath: 'open_workspace → validate_workspace → run_tests (e2e:developer-workflow, dry-run)',
    id: 'workflow_run_tests',
    label: 'Run test command in terminal via workflow engine',
    lane: 'workflow',
    level: 'product-supported',
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp e2e:developer-workflow',
    unitTests: [
      'src/workflows/engine.test.ts',
      'src/server/workflow-formatter.test.ts',
    ],
  },
  {
    id: 'workflow_inspect_failure',
    label: 'Inspect IDE failure panel via accessibility',
    lane: 'workflow',
    level: 'covered',
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp smoke:workflow',
    unitTests: ['src/workflows/engine.test.ts'],
  },
  {
    id: 'workflow_resume',
    label: 'Resume paused workflow after approval',
    lane: 'workflow',
    level: 'covered',
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp smoke:workflow',
    unitTests: ['src/workflows/engine.test.ts'],
  },
  {
    happyPath: 'workflow_browse_and_act → reroute detected → suggestedTool succeeds (secondary regression)',
    id: 'workflow_reroute_contract',
    label: 'Stable outward reroute contract (structuredContent)',
    lane: 'workflow',
    level: 'covered',
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp e2e:browser-reroute',
    unitTests: [
      'src/server/workflow-formatter.test.ts',
    ],
  },

  // ── Browser lane ───────────────────────────────────────────────────────
  {
    happyPath: 'Dual-stack browser selection is covered by strategy/formatter tests; secondary reroute regression remains surface-agnostic under dry-run.',
    id: 'browser_reroute_dual_stack',
    label: 'Browser DOM/CDP dual-stack reroute with surface selection',
    lane: 'browser',
    level: 'covered',
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp e2e:browser-reroute',
    unitTests: [
      'src/strategy.test.ts',
      'src/server/workflow-formatter.test.ts',
    ],
  },
  {
    id: 'browser_surface_availability',
    label: 'Browser surface availability model (availableSurfaces/preferredSurface)',
    lane: 'browser',
    level: 'covered',
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp smoke:workflow',
    unitTests: [
      'src/strategy.test.ts',
      'src/server/workflow-formatter.test.ts',
    ],
  },
  {
    id: 'workflow_browse_and_act',
    label: 'Browser workflow orchestration',
    lane: 'browser',
    level: 'covered',
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp smoke:workflow',
    unitTests: ['src/workflows/engine.test.ts'],
  },

  // ── Desktop/native lane ────────────────────────────────────────────────
  {
    happyPath: 'focus app → screenshot → accessibility_snapshot basic loop',
    id: 'desktop_focus_screenshot_accessibility',
    label: 'Focus app + screenshot + accessibility observation',
    lane: 'desktop-native',
    level: 'covered',
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp smoke:stdio',
    unitTests: ['src/server/action-executor.test.ts'],
  },
  {
    happyPath: 'desktop_ensure_chrome → desktop_observe → desktop_click_target → desktop_get_state updates grounding and pointer state',
    id: 'desktop_v3_chrome_grounding',
    label: 'Desktop v3 Chrome grounding smoke (ensure / observe / click / state)',
    lane: 'desktop-native',
    level: 'covered',
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp smoke:desktop-v3',
    unitTests: [
      'src/bin/smoke-chrome-grounding.test.ts',
      'src/server/register-chrome-session.test.ts',
      'src/server/register-desktop-grounding.test.ts',
      'src/server/register-desktop-grounding-tools.test.ts',
    ],
  },
  {
    id: 'desktop_browser_dom_route_contract',
    label: 'Browser-dom route contract (left single-click, fail-closed bridge responses)',
    lane: 'desktop-native',
    level: 'covered',
    unitTests: [
      'src/browser-action-router.test.ts',
      'src/browser-dom/extension-bridge.test.ts',
    ],
  },
  {
    id: 'desktop_click_type_press',
    label: 'Native mouse click / keyboard type / key press',
    lane: 'desktop-native',
    level: 'implemented',
    unitTests: ['src/server/action-executor.test.ts'],
  },
  {
    id: 'desktop_scroll_observe_windows',
    label: 'Scroll + observe windows',
    lane: 'desktop-native',
    level: 'implemented',
  },
  {
    id: 'desktop_approval_queue',
    label: 'Approval queue (list / approve / reject pending actions)',
    lane: 'desktop-native',
    level: 'covered',
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp smoke:workflow',
  },
  {
    id: 'task_memory_mvp',
    label: 'Task memory persistence across sessions',
    lane: 'desktop-native',
    level: 'covered',
    unitTests: ['src/state.test.ts'],
  },

  // ── Terminal lane ───────────────────────────────────────────────────────
  {
    happyPath: 'terminal_exec happy path: run command, capture stdout/stderr/exitCode, update run-state',
    id: 'terminal_exec',
    label: 'One-shot non-interactive command execution (exec surface)',
    lane: 'terminal',
    level: 'product-supported',
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp e2e:terminal-exec',
    unitTests: [
      'src/server/action-executor.test.ts',
      'src/workflows/engine.test.ts',
      'src/terminal-release-gates.test.ts',
    ],
  },
  {
    happyPath: 'AIRI chat validates the repo → workflow self-acquires PTY for vim --version → PTY remains readable and run-state / audit / bindings stay consistent',
    id: 'terminal_pty',
    label: 'Interactive PTY session lifecycle (pty surface)',
    lane: 'terminal',
    level: 'product-supported',
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp e2e:airi-chat-terminal-self-acquire',
    unitTests: [
      'src/server/register-pty.test.ts',
      'src/server/register-pty-terminal-lane.test.ts',
      'src/workflows/engine.test.ts',
      'src/server/workflow-prep-tools.test.ts',
      'src/terminal-release-gates.test.ts',
    ],
  },
  {
    happyPath: 'run_command step hits TUI → strategy emits use_pty_surface → workflow reroutes to PTY (secondary; v2 self-acquire is primary)',
    id: 'terminal_exec_to_pty_reroute',
    label: 'exec → pty reroute when interactive session detected (legacy fallback)',
    lane: 'terminal',
    level: 'covered',
    unitTests: [
      'src/strategy.test.ts',
      'src/workflows/engine.test.ts',
      'src/terminal-release-gates.test.ts',
    ],
  },
  {
    happyPath: 'step with mode=auto → surface resolver checks bound session / interaction / patterns → selects exec or pty',
    id: 'terminal_auto_surface_resolution',
    label: 'Auto surface resolution (exec/auto/pty mode, 4 fixed auto conditions)',
    lane: 'terminal',
    level: 'covered',
    unitTests: [
      'src/workflows/surface-resolver.test.ts',
      'src/terminal/interactive-patterns.test.ts',
    ],
  },
  {
    happyPath: 'workflow_validate_workspace starts on exec, self-acquires PTY for the interactive validation step, and completes without harness-side pty_create',
    id: 'terminal_pty_self_acquire',
    label: 'Workflow self-acquires PTY via unified approval (no outward reroute)',
    lane: 'terminal',
    level: 'product-supported',
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp e2e:airi-chat-terminal-self-acquire',
    unitTests: [
      'src/workflows/engine.test.ts',
      'src/server/workflow-prep-tools.test.ts',
    ],
  },
  {
    happyPath: 'pty_send_input / pty_read_screen / pty_wait_for_output / pty_destroy_session execute inside workflow engine',
    id: 'terminal_pty_step_family',
    label: 'In-workflow PTY step family (send_input / read_screen / wait_for_output / destroy)',
    lane: 'terminal',
    level: 'covered',
    unitTests: [
      'src/workflows/engine.test.ts',
    ],
  },
  {
    id: 'terminal_pty_open_grant',
    label: 'PTY Open Grant approval model (pty_create → session-scoped grant)',
    lane: 'terminal',
    level: 'covered',
    unitTests: [
      'src/server/register-pty.test.ts',
    ],
  },
  {
    id: 'terminal_pty_audit',
    label: 'PTY audit logging (create/send_input/read_screen/resize/destroy)',
    lane: 'terminal',
    level: 'covered',
    unitTests: [
      'src/server/register-pty.test.ts',
    ],
  },
  {
    id: 'terminal_vscode_controller',
    label: 'VS Code CLI controller (open/file/task/problems)',
    lane: 'terminal',
    level: 'covered',
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp smoke:stdio',
    unitTests: [
      'src/server/register-vscode.test.ts',
    ],
  },
  {
    id: 'terminal_step_binding',
    label: 'Workflow step terminal binding (taskId + stepId + surface)',
    lane: 'terminal',
    level: 'covered',
    unitTests: [
      'src/workflows/engine.test.ts',
    ],
  },

  // ── Handoff lane ───────────────────────────────────────────────────────
  {
    id: 'secret_read_env_value',
    label: 'Read .env secrets without terminal echo',
    lane: 'handoff',
    level: 'covered',
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp smoke:stdio',
  },
  {
    id: 'clipboard_read_write',
    label: 'Clipboard read/write text handoff',
    lane: 'handoff',
    level: 'covered',
    smokeCommand: 'pnpm -F @proj-airi/computer-use-mcp smoke:stdio',
  },
  {
    happyPath: 'MCP returns reroute → stage-ui parser extracts → fixed template observation → provider paths consume the same reroute signal in tests',
    id: 'reroute_consumer_stage_ui',
    label: 'Reroute consumption in stage-ui (mcp.ts + llm-tool-loop)',
    lane: 'handoff',
    level: 'covered',
    smokeCommand: 'pnpm exec vitest run packages/stage-ui/src/tools/mcp-reroute.test.ts packages/stage-ui/src/tools/mcp.test.ts',
    unitTests: [
      'packages/stage-ui/src/tools/mcp-reroute.test.ts',
      'packages/stage-ui/src/tools/mcp.test.ts',
    ],
  },
]

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export function getByLane(lane: Lane): SupportMatrixEntry[] {
  return supportMatrix.filter(entry => entry.lane === lane)
}

export function getLaneHappyPath(lane: Lane): SupportMatrixEntry | undefined {
  return supportMatrix.find(entry => entry.lane === lane && entry.happyPath)
}

export function getProductSupported(): SupportMatrixEntry[] {
  return supportMatrix.filter(entry => entry.level === 'product-supported')
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
