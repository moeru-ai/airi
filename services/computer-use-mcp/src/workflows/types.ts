/**
 * Workflow type definitions.
 *
 * A workflow is a pre-defined sequence of high-level steps that the
 * system can execute to accomplish a common task. Each step describes
 * what to do, not how — the actual tool selection and parameters
 * are resolved at execution time by the workflow engine.
 */

import type { ActionInvocation } from '../types'

/**
 * Whether the terminal interaction is ephemeral or long-lived.
 * - `one_shot`: command runs and exits (default)
 * - `persistent`: process stays running for ongoing interaction
 */
export type TerminalInteraction = 'one_shot' | 'persistent'

// ---------------------------------------------------------------------------
// Terminal step configuration
// ---------------------------------------------------------------------------

/**
 * How the workflow engine selects a terminal surface for a step.
 * - `exec`: always use one-shot exec (default for run_command)
 * - `auto`: engine resolves surface based on 4 fixed conditions
 * - `pty`: always use PTY surface
 */
export type TerminalMode = 'auto' | 'exec' | 'pty'

/** Explicit terminal configuration for a workflow step. */
export interface TerminalStepConfig {
  interaction: TerminalInteraction
  mode: TerminalMode
}

export interface WorkflowDefinition {
  /** Description of what this workflow accomplishes. */
  description: string
  /** Unique identifier for this workflow. */
  id: string
  /** Maximum number of retries for the entire workflow. */
  maxRetries: number
  /** Human-readable name. */
  name: string
  /** Ordered list of step templates. */
  steps: WorkflowStepTemplate[]
}

export type WorkflowStepKind
  = | 'change_directory' // cd into a project directory
    | 'click_element' // Click on a UI element (coordinates resolved from context)
    | 'ensure_app' // Make sure a specific app is open & focused
    | 'evaluate' // Strategy evaluation checkpoint (no action)
    | 'observe_windows' // List windows
    | 'press_shortcut' // Press a keyboard shortcut
    | 'pty_destroy_session' // Explicitly destroy a PTY session (optional cleanup)
    | 'pty_read_screen' // Read the current PTY screen buffer
    | 'pty_send_input' // Send keystrokes / data to a bound PTY session
    | 'pty_wait_for_output' // Wait until a marker appears in PTY output
    | 'run_command' // Execute a terminal command
    | 'run_command_read_result' // Execute a command and capture structured output for the next step
    // PTY workflow step family — explicit interactive terminal operations
    | 'summarize' // Produce a summary of results
    | 'take_screenshot' // Capture current state
    | 'type_into' // Type text into focused element
    | 'wait' // Wait for UI to settle

export interface WorkflowStepTemplate {
  /**
   * If true, a failure in this step aborts the workflow.
   * Default: false (the engine will try to recover).
   */
  critical?: boolean
  /** Short description of what this step accomplishes. */
  description: string
  /** What kind of step this is. */
  kind: WorkflowStepKind
  /** Unique label for this step. */
  label: string
  /**
   * Static parameters for this step. Interpreted based on `kind`:
   * - ensure_app: { app: string }
   * - change_directory: { path: string }
   * - run_command: { command: string, cwd?: string, timeoutMs?: number }
   * - run_command_read_result: { command: string, cwd?: string, timeoutMs?: number } (same as run_command, but engine captures stdout/stderr into step metadata)
   * - take_screenshot: { label?: string }
   * - observe_windows: { limit?: number, app?: string }
   * - click_element: { x: number, y: number }
   * - type_into: { text: string, pressEnter?: boolean }
   * - press_shortcut: { keys: string[] }
   * - wait: { durationMs: number }
   * - evaluate: {}
   * - summarize: {}
   */
  params: Record<string, unknown>
  /**
   * Whether this step can be skipped if a precondition is already met.
   * For example, ensure_app can be skipped if the app is already focused.
   */
  skippable?: boolean
  /**
   * Terminal surface configuration for run_command / run_command_read_result steps.
   * Ignored on non-terminal step kinds.
   * Default: `{ mode: 'exec', interaction: 'one_shot' }`
   */
  terminal?: TerminalStepConfig
}

/**
 * Resolve a workflow step template into an ActionInvocation that the
 * action executor can handle, or return undefined if the step is a
 * non-action step (evaluate, summarize).
 */
export function resolveStepAction(step: WorkflowStepTemplate): ActionInvocation | undefined {
  switch (step.kind) {
    case 'change_directory':
      return { input: { command: `cd "${step.params.path as string}" && pwd` }, kind: 'terminal_exec' }
    case 'click_element':
      return { input: { captureAfter: true, x: step.params.x as number, y: step.params.y as number }, kind: 'click' }
    case 'ensure_app':
      return { input: { app: step.params.app as string }, kind: 'focus_app' }
    case 'evaluate':
    case 'summarize':
      return undefined
    case 'observe_windows':
      return {
        input: {
          app: step.params.app as string | undefined,
          limit: step.params.limit as number | undefined,
        },
        kind: 'observe_windows',
      }
    case 'press_shortcut':
      return { input: { captureAfter: true, keys: step.params.keys as string[] }, kind: 'press_keys' }
    // PTY step family — handled by the engine's PTY execution path, not resolveStepAction
    case 'pty_destroy_session':
    case 'pty_read_screen':
    case 'pty_send_input':
    case 'pty_wait_for_output':
      return undefined
    case 'run_command':
    case 'run_command_read_result':
      return {
        input: {
          command: step.params.command as string,
          cwd: step.params.cwd as string | undefined,
          timeoutMs: step.params.timeoutMs as number | undefined,
        },
        kind: 'terminal_exec',
      }
    case 'take_screenshot':
      return { input: { label: step.params.label as string | undefined }, kind: 'screenshot' }
    case 'type_into':
      return {
        input: {
          captureAfter: true,
          pressEnter: step.params.pressEnter as boolean | undefined,
          text: step.params.text as string,
        },
        kind: 'type_text',
      }
    case 'wait':
      return { input: { captureAfter: true, durationMs: step.params.durationMs as number }, kind: 'wait' }
  }
}

/**
 * Resolve the effective terminal config for a step, falling back to
 * the default `mode='exec', interaction='one_shot'`.
 */
export function resolveTerminalConfig(step: WorkflowStepTemplate): TerminalStepConfig {
  if (step.terminal) {
    return step.terminal
  }
  // Default: auto mode lets the surface resolver detect interactive patterns.
  return { interaction: 'one_shot', mode: 'auto' }
}
