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
    | 'take_screenshot' // Capture current state
    | 'observe_windows' // List windows
    | 'click_element' // Click on a UI element (coordinates resolved from context)
    | 'type_into' // Type text into focused element
    | 'press_shortcut' // Press a keyboard shortcut
    | 'wait' // Wait for UI to settle
    | 'evaluate' // Strategy evaluation checkpoint (no action)
    | 'summarize' // Produce a summary of results

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
   * - run_command: { command: string, timeoutMs?: number }
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
      return {
        kind: 'terminal_exec',
        input: {
          command: step.params.command as string,
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
      return undefined
  }
}
