/**
 * Terminal surface resolver — determines the target terminal surface for
 * a workflow step based on its config, PTY binding, and command.
 *
 * `auto` mode only fires on this minimal set:
 *   1. Current taskId + stepId already has a bound PTY session
 *   2. Step declares `interaction: 'persistent'`
 *   3. Command matches `KNOWN_INTERACTIVE_COMMAND_PATTERNS`
 *
 * No additional heuristics are applied.
 */

import type { RunState } from '../state'
import type { TerminalSurface } from '../types'
import type { TerminalStepConfig } from './types'

import { isKnownInteractiveCommand } from '../terminal/interactive-patterns'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SurfaceResolutionInput {
  taskId: string
  stepId: string
  config: TerminalStepConfig
  command: string
  state: RunState
}

export type SurfaceResolutionReason
  = | 'explicit_exec'
    | 'explicit_pty'
    | 'auto_bound_session'
    | 'auto_persistent_interaction'
    | 'auto_interactive_command'
    | 'auto_default_exec'

export interface SurfaceResolution {
  surface: TerminalSurface
  reason: SurfaceResolutionReason
  /** PTY session id to reuse (only for auto_bound_session). */
  boundPtySessionId?: string
  /** Human-readable explanation. */
  explanation: string
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Resolve the target terminal surface for a workflow step.
 * Pure function — no side effects.
 */
export function resolveTerminalSurface(input: SurfaceResolutionInput): SurfaceResolution {
  const { taskId, stepId, config, command, state } = input

  // Explicit mode: exec
  if (config.mode === 'exec') {
    return {
      surface: 'exec',
      reason: 'explicit_exec',
      explanation: 'Step uses explicit exec mode.',
    }
  }

  // Explicit mode: pty
  if (config.mode === 'pty') {
    // Check for existing bound session
    const bound = findBoundPtySession(taskId, stepId, state)
    return {
      surface: 'pty',
      reason: 'explicit_pty',
      boundPtySessionId: bound?.id,
      explanation: bound
        ? `Step uses explicit pty mode, reusing bound session ${bound.id}.`
        : 'Step uses explicit pty mode, PTY will be acquired.',
    }
  }

  // Auto mode checks the binding, interaction, and command in order.
  // Condition 1: existing binding for taskId + stepId
  const bound = findBoundPtySession(taskId, stepId, state)
  if (bound) {
    return {
      surface: 'pty',
      reason: 'auto_bound_session',
      boundPtySessionId: bound.id,
      explanation: `Reusing bound PTY session ${bound.id} for step ${stepId}.`,
    }
  }

  // Condition 2: step declares persistent interaction
  if (config.interaction === 'persistent') {
    return {
      surface: 'pty',
      reason: 'auto_persistent_interaction',
      explanation: 'Step declares persistent interaction, PTY will be acquired.',
    }
  }

  // Condition 3: command matches known interactive patterns
  if (isKnownInteractiveCommand(command)) {
    return {
      surface: 'pty',
      reason: 'auto_interactive_command',
      explanation: `Command "${truncateCommand(command)}" matches a known interactive pattern.`,
    }
  }

  // Default: exec
  return {
    surface: 'exec',
    reason: 'auto_default_exec',
    explanation: 'No auto conditions matched, defaulting to exec.',
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
