/**
 * Terminal surface resolver — determines the target terminal surface for
 * a workflow step based on explicit config and 4 fixed conditions.
 *
 * `auto` mode only fires on this minimal set:
 *   1. Current taskId + stepId already has a bound PTY session
 *   2. Step declares `interaction: 'persistent'`
 *   3. Command matches `KNOWN_INTERACTIVE_COMMAND_PATTERNS`
 *   4. A previous exec attempt failed/timed out and output matches
 *      `INTERACTIVE_OUTPUT_MARKERS`
 *
 * No additional heuristics are applied.
 */

import type { RunState } from '../state'
import type { TerminalSurface } from '../types'
import type { TerminalStepConfig } from './types'

import { hasInteractiveOutputMarkers, isKnownInteractiveCommand } from '../terminal/interactive-patterns'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SurfaceResolution {
  /** PTY session id to reuse (only for auto_bound_session). */
  boundPtySessionId?: string
  /** Human-readable explanation. */
  explanation: string
  reason: SurfaceResolutionReason
  surface: TerminalSurface
}

export interface SurfaceResolutionInput {
  command: string
  config: TerminalStepConfig
  /** Set when auto triggers condition 4 (exec failed, check output). */
  previousExecOutput?: string
  state: RunState
  stepId: string
  taskId: string
}

export type SurfaceResolutionReason
  = | 'auto_bound_session'
    | 'auto_default_exec'
    | 'auto_interactive_command'
    | 'auto_interactive_output'
    | 'auto_persistent_interaction'
    | 'explicit_exec'
    | 'explicit_pty'

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Resolve the target terminal surface for a workflow step.
 * Pure function — no side effects.
 */
export function resolveTerminalSurface(input: SurfaceResolutionInput): SurfaceResolution {
  const { command, config, previousExecOutput, state, stepId, taskId } = input

  // Explicit mode: exec
  if (config.mode === 'exec') {
    return {
      explanation: 'Step uses explicit exec mode.',
      reason: 'explicit_exec',
      surface: 'exec',
    }
  }

  // Explicit mode: pty
  if (config.mode === 'pty') {
    // Check for existing bound session
    const bound = findBoundPtySession(taskId, stepId, state)
    return {
      boundPtySessionId: bound?.id,
      explanation: bound
        ? `Step uses explicit pty mode, reusing bound session ${bound.id}.`
        : 'Step uses explicit pty mode, PTY will be acquired.',
      reason: 'explicit_pty',
      surface: 'pty',
    }
  }

  // Auto mode — check 4 fixed conditions in order
  // Condition 1: existing binding for taskId + stepId
  const bound = findBoundPtySession(taskId, stepId, state)
  if (bound) {
    return {
      boundPtySessionId: bound.id,
      explanation: `Reusing bound PTY session ${bound.id} for step ${stepId}.`,
      reason: 'auto_bound_session',
      surface: 'pty',
    }
  }

  // Condition 2: step declares persistent interaction
  if (config.interaction === 'persistent') {
    return {
      explanation: 'Step declares persistent interaction, PTY will be acquired.',
      reason: 'auto_persistent_interaction',
      surface: 'pty',
    }
  }

  // Condition 3: command matches known interactive patterns
  if (isKnownInteractiveCommand(command)) {
    return {
      explanation: `Command "${truncateCommand(command)}" matches a known interactive pattern.`,
      reason: 'auto_interactive_command',
      surface: 'pty',
    }
  }

  // Condition 4: previous exec output has interactive markers
  if (previousExecOutput && hasInteractiveOutputMarkers(previousExecOutput)) {
    return {
      explanation: 'Previous exec output contains interactive markers, switching to PTY.',
      reason: 'auto_interactive_output',
      surface: 'pty',
    }
  }

  // Default: exec
  return {
    explanation: 'No auto conditions matched, defaulting to exec.',
    reason: 'auto_default_exec',
    surface: 'exec',
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findBoundPtySession(taskId: string, stepId: string, state: RunState) {
  // Look for step binding with a PTY session id
  const binding = state.workflowStepTerminalBindings.find(
    b => b.taskId === taskId && b.stepId === stepId && b.surface === 'pty' && b.ptySessionId,
  )
  if (binding?.ptySessionId) {
    const session = state.ptySessions.find(s => s.id === binding.ptySessionId && s.alive)
    if (session) {
      return session
    }
  }
  return undefined
}

function truncateCommand(cmd: string, maxLen = 60): string {
  return cmd.length > maxLen ? `${cmd.slice(0, maxLen - 3)}...` : cmd
}
