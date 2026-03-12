/**
 * Workflow type definitions.
 *
 * A workflow is a pre-defined sequence of high-level steps that the
 * system can execute to accomplish a common task. Each step describes
 * what to do, not how — the actual tool selection and parameters
 * are resolved at execution time by the workflow engine.
 */

import type { ActionInvocation } from '../types'

export type WorkflowStepKind
  = | 'ensure_app' // Make sure a specific app is open & focused
    | 'change_directory' // cd into a project directory
    | 'run_command' // Execute a terminal command
    | 'run_command_read_result' // Execute a command and capture structured output for the next step
    | 'take_screenshot' // Capture current state
    | 'observe_windows' // List windows
    | 'click_element' // Click on a UI element (coordinates resolved from context)
    | 'type_into' // Type text into focused element
    | 'press_shortcut' // Press a keyboard shortcut
    | 'wait' // Wait for UI to settle
    | 'evaluate' // Strategy evaluation checkpoint (no action)
    | 'summarize' // Produce a summary of results
    // PTY workflow step family — explicit interactive terminal operations
    | 'pty_send_input' // Send keystrokes / data to a bound PTY session
    | 'pty_read_screen' // Read the current PTY screen buffer
    | 'pty_wait_for_output' // Wait until a marker appears in PTY output
    | 'pty_destroy_session' // Explicitly destroy a PTY session (optional cleanup)

// ---------------------------------------------------------------------------
// Terminal step configuration
// ---------------------------------------------------------------------------

/**
 * How the workflow engine selects a terminal surface for a step.
 * - `exec`: always use one-shot exec (default for run_command)
 * - `auto`: engine resolves surface based on 4 fixed conditions
 * - `pty`: always use PTY surface
 */
export type TerminalMode = 'exec' | 'auto' | 'pty'

/**
 * Whether the terminal interaction is ephemeral or long-lived.
 * - `one_shot`: command runs and exits (default)
 * - `persistent`: process stays running for ongoing interaction
 */
export type TerminalInteraction = 'one_shot' | 'persistent'

/** Explicit terminal configuration for a workflow step. */
export interface TerminalStepConfig {
  mode: TerminalMode
  interaction: TerminalInteraction
}

export interface WorkflowStepTemplate {
  /** Unique label for this step. */
  label: string
  /** What kind of step this is. */
  kind: WorkflowStepKind
  /** Short description of what this step accomplishes. */
  description: string
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
   * If true, a failure in this step aborts the workflow.
   * Default: false (the engine will try to recover).
   */
  critical?: boolean
  /**
   * Terminal surface configuration for run_command / run_command_read_result steps.
   * Ignored on non-terminal step kinds.
   * Default: `{ mode: 'exec', interaction: 'one_shot' }`
   */
  terminal?: TerminalStepConfig
}

export interface WorkflowDefinition {
  /** Unique identifier for this workflow. */
  id: string
  /** Human-readable name. */
  name: string
  /** Description of what this workflow accomplishes. */
  description: string
  /** Ordered list of step templates. */
  steps: WorkflowStepTemplate[]
  /** Maximum number of retries for the entire workflow. */
  maxRetries: number
}

/**
 * Resolve a workflow step template into an ActionInvocation that the
 * action executor can handle, or return undefined if the step is a
 * non-action step (evaluate, summarize).
 */
export function resolveStepAction(step: WorkflowStepTemplate): ActionInvocation | undefined {
  switch (step.kind) {
    case 'ensure_app':
      return { kind: 'focus_app', input: { app: step.params.app as string } }
    case 'change_directory':
      return { kind: 'terminal_exec', input: { command: `cd "${step.params.path as string}" && pwd` } }
    case 'run_command':
    case 'run_command_read_result':
      return {
        kind: 'terminal_exec',
        input: {
          command: step.params.command as string,
          cwd: step.params.cwd as string | undefined,
          timeoutMs: step.params.timeoutMs as number | undefined,
        },
      }
    case 'take_screenshot':
      return { kind: 'screenshot', input: { label: step.params.label as string | undefined } }
    case 'observe_windows':
      return {
        kind: 'observe_windows',
        input: {
          limit: step.params.limit as number | undefined,
          app: step.params.app as string | undefined,
        },
      }
    case 'click_element':
      return { kind: 'click', input: { x: step.params.x as number, y: step.params.y as number, captureAfter: true } }
    case 'type_into':
      return {
        kind: 'type_text',
        input: {
          text: step.params.text as string,
          pressEnter: step.params.pressEnter as boolean | undefined,
          captureAfter: true,
        },
      }
    case 'press_shortcut':
      return { kind: 'press_keys', input: { keys: step.params.keys as string[], captureAfter: true } }
    case 'wait':
      return { kind: 'wait', input: { durationMs: step.params.durationMs as number, captureAfter: true } }
    case 'evaluate':
    case 'summarize':
    // PTY step family — handled by the engine's PTY execution path, not resolveStepAction
    case 'pty_send_input':
    case 'pty_read_screen':
    case 'pty_wait_for_output':
    case 'pty_destroy_session':
      return undefined
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
  return { mode: 'auto', interaction: 'one_shot' }
}
