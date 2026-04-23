import type { RunState } from '../state'
import type { SurfaceResolutionInput } from './surface-resolver'

import { describe, expect, it } from 'vitest'

import { resolveTerminalSurface } from './surface-resolver'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyState(): RunState {
  return {
    pendingApprovalCount: 0,
    lastApprovalRejected: false,
    ptySessions: [],
    workflowStepTerminalBindings: [],
    ptyApprovalGrants: [],
    ptyAuditLog: [],
    updatedAt: new Date().toISOString(),
  }
}

function ptySession(id: string, alive = true) {
  return { id, alive, rows: 24, cols: 80, cwd: '/tmp', pid: 1234, createdAt: new Date().toISOString() }
}

function binding(taskId: string, stepId: string, ptySessionId: string) {
  return { taskId, stepId, surface: 'pty' as const, ptySessionId }
}

function base(overrides: Partial<SurfaceResolutionInput> = {}): SurfaceResolutionInput {
  return {
    taskId: 'task-1',
    stepId: 'step-1',
    config: { mode: 'auto', interaction: 'one_shot' },
    command: 'echo hello',
    state: emptyState(),
    ...overrides,
  }
}

describe('resolveTerminalSurface', () => {
  // Explicit modes
  describe('explicit mode', () => {
    it('returns exec for mode=exec', () => {
      const res = resolveTerminalSurface(base({
        config: { mode: 'exec', interaction: 'one_shot' },
      }))
      expect(res.surface).toBe('exec')
      expect(res.reason).toBe('explicit_exec')
    })

    it('returns pty for mode=pty (no bound session)', () => {
      const res = resolveTerminalSurface(base({
        config: { mode: 'pty', interaction: 'one_shot' },
      }))
      expect(res.surface).toBe('pty')
      expect(res.reason).toBe('explicit_pty')
      expect(res.boundPtySessionId).toBeUndefined()
    })

    it('returns pty with bound session for mode=pty', () => {
      const state = emptyState()
      state.ptySessions = [ptySession('pty-1')]
      state.workflowStepTerminalBindings = [binding('task-1', 'step-1', 'pty-1')]

      const res = resolveTerminalSurface(base({
        config: { mode: 'pty', interaction: 'persistent' },
        state,
      }))
      expect(res.surface).toBe('pty')
      expect(res.reason).toBe('explicit_pty')
      expect(res.boundPtySessionId).toBe('pty-1')
    })
  })

  // Auto conditions
  describe('auto mode', () => {
    it('condition 1: auto_bound_session when step already has a bound PTY', () => {
      const state = emptyState()
      state.ptySessions = [ptySession('pty-bound')]
      state.workflowStepTerminalBindings = [binding('task-1', 'step-1', 'pty-bound')]

      const res = resolveTerminalSurface(base({ state }))
      expect(res.surface).toBe('pty')
      expect(res.reason).toBe('auto_bound_session')
      expect(res.boundPtySessionId).toBe('pty-bound')
    })

    it('condition 1: ignores dead PTY sessions', () => {
      const state = emptyState()
      state.ptySessions = [ptySession('pty-dead', false)]
      state.workflowStepTerminalBindings = [binding('task-1', 'step-1', 'pty-dead')]

      const res = resolveTerminalSurface(base({ state }))
      expect(res.surface).toBe('exec')
      expect(res.reason).toBe('auto_default_exec')
    })

    it('condition 2: auto_persistent_interaction', () => {
      const res = resolveTerminalSurface(base({
        config: { mode: 'auto', interaction: 'persistent' },
      }))
      expect(res.surface).toBe('pty')
      expect(res.reason).toBe('auto_persistent_interaction')
    })

    it('condition 3: auto_interactive_command for TUI', () => {
      const res = resolveTerminalSurface(base({ command: 'vim' }))
      expect(res.surface).toBe('pty')
      expect(res.reason).toBe('auto_interactive_command')
    })

    it('condition 3: auto_interactive_command for REPL', () => {
      const res = resolveTerminalSurface(base({ command: 'python3 -i' }))
      expect(res.surface).toBe('pty')
      expect(res.reason).toBe('auto_interactive_command')
    })

    it('condition 3: auto_interactive_command for init wizard', () => {
      const res = resolveTerminalSurface(base({ command: 'npm create' }))
      expect(res.surface).toBe('pty')
      expect(res.reason).toBe('auto_interactive_command')
    })

    it('condition 4: auto_interactive_output with markers', () => {
      const res = resolveTerminalSurface(base({
        previousExecOutput: 'Waiting for input... Password: ',
      }))
      expect(res.surface).toBe('pty')
      expect(res.reason).toBe('auto_interactive_output')
    })

    it('condition 4: no match without markers in output', () => {
      const res = resolveTerminalSurface(base({
        previousExecOutput: 'Build succeeded',
      }))
      expect(res.surface).toBe('exec')
      expect(res.reason).toBe('auto_default_exec')
    })

    it('defaults to exec when no auto conditions match', () => {
      const res = resolveTerminalSurface(base())
      expect(res.surface).toBe('exec')
      expect(res.reason).toBe('auto_default_exec')
    })
  })

  // Priority order
  describe('priority order', () => {
    it('bound session wins over persistent interaction', () => {
      const state = emptyState()
      state.ptySessions = [ptySession('pty-p')]
      state.workflowStepTerminalBindings = [binding('task-1', 'step-1', 'pty-p')]

      const res = resolveTerminalSurface(base({
        config: { mode: 'auto', interaction: 'persistent' },
        command: 'vim',
        state,
      }))
      expect(res.reason).toBe('auto_bound_session')
    })

    it('persistent interaction wins over interactive command', () => {
      const res = resolveTerminalSurface(base({
        config: { mode: 'auto', interaction: 'persistent' },
        command: 'echo plain',
      }))
      expect(res.reason).toBe('auto_persistent_interaction')
    })

    it('interactive command wins over interactive output', () => {
      const res = resolveTerminalSurface(base({
        command: 'vim',
        previousExecOutput: 'Password:',
      }))
      expect(res.reason).toBe('auto_interactive_command')
    })
  })

  // Explanation
  describe('explanation', () => {
    it('always provides a non-empty explanation', () => {
      const reasons: Array<Partial<SurfaceResolutionInput>> = [
        { config: { mode: 'exec', interaction: 'one_shot' } },
        { config: { mode: 'pty', interaction: 'one_shot' } },
        { config: { mode: 'auto', interaction: 'persistent' } },
        { command: 'vim' },
        { previousExecOutput: 'Password:' },
        {},
      ]

      for (const r of reasons) {
        const res = resolveTerminalSurface(base(r))
        expect(res.explanation).toBeTruthy()
        expect(res.explanation.length).toBeGreaterThan(0)
      }
    })
  })
})
