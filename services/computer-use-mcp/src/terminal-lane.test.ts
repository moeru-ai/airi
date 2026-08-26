/**
 * Terminal Lane v1 — comprehensive tests.
 *
 * Covers:
 * 1. State: surface decisions, step bindings, Open Grant, audit
 * 2. Strategy: PTY session selection with stepId preference
 * 3. Support matrix: terminal lane entries
 */

import { describe, expect, it } from 'vitest'

import { RunStateManager } from './state'
import {
  getByLane,
  getLaneHappyPath,
  getProductSupported,
  supportMatrix,
  validateProductSupported,
} from './support-matrix'

// ---------------------------------------------------------------------------
// 1. State — Surface Decision
// ---------------------------------------------------------------------------

describe('state: surface decision', () => {
  it('records and retrieves a surface decision', () => {
    const sm = new RunStateManager()

    sm.recordSurfaceDecision({
      surface: 'exec',
      transport: 'exec',
      reason: 'one-shot command',
      source: 'strategy',
    })

    const decision = sm.getRecentSurfaceDecision()
    expect(decision).toBeDefined()
    expect(decision!.surface).toBe('exec')
    expect(decision!.transport).toBe('exec')
    expect(decision!.reason).toBe('one-shot command')
    expect(decision!.source).toBe('strategy')
    expect(decision!.at).toBeTruthy()
  })

  it('overwrites previous decision on re-record', () => {
    const sm = new RunStateManager()

    sm.recordSurfaceDecision({ surface: 'exec', transport: 'exec', reason: 'first', source: 'test' })
    sm.recordSurfaceDecision({ surface: 'pty', transport: 'pty', reason: 'rerouted', source: 'workflow_reroute' })

    const decision = sm.getRecentSurfaceDecision()
    expect(decision!.surface).toBe('pty')
    expect(decision!.source).toBe('workflow_reroute')
  })

  it('returns undefined when no decision recorded', () => {
    const sm = new RunStateManager()
    expect(sm.getRecentSurfaceDecision()).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 2. State — Step Terminal Bindings
// ---------------------------------------------------------------------------

describe('state: step terminal bindings', () => {
  it('adds and retrieves a binding', () => {
    const sm = new RunStateManager()

    sm.addStepTerminalBinding({
      taskId: 'task_1',
      stepId: 'step_a',
      surface: 'exec',
    })

    const binding = sm.getStepTerminalBinding('task_1', 'step_a')
    expect(binding).toBeDefined()
    expect(binding!.surface).toBe('exec')
    expect(binding!.ptySessionId).toBeUndefined()
  })

  it('replaces binding for same taskId+stepId', () => {
    const sm = new RunStateManager()

    sm.addStepTerminalBinding({ taskId: 't1', stepId: 's1', surface: 'exec' })
    sm.addStepTerminalBinding({ taskId: 't1', stepId: 's1', surface: 'pty', ptySessionId: 'pty_1' })

    const binding = sm.getStepTerminalBinding('t1', 's1')
    expect(binding!.surface).toBe('pty')
    expect(binding!.ptySessionId).toBe('pty_1')

    // Should only have one entry, not two
    expect(sm.getState().workflowStepTerminalBindings).toHaveLength(1)
  })

  it('clears bindings for a task', () => {
    const sm = new RunStateManager()

    sm.addStepTerminalBinding({ taskId: 't1', stepId: 's1', surface: 'exec' })
    sm.addStepTerminalBinding({ taskId: 't1', stepId: 's2', surface: 'pty' })
    sm.addStepTerminalBinding({ taskId: 't2', stepId: 's1', surface: 'exec' })

    sm.clearTaskTerminalBindings('t1')

    expect(sm.getStepTerminalBinding('t1', 's1')).toBeUndefined()
    expect(sm.getStepTerminalBinding('t1', 's2')).toBeUndefined()
    expect(sm.getStepTerminalBinding('t2', 's1')).toBeDefined()
  })

  it('returns undefined for non-existent binding', () => {
    const sm = new RunStateManager()
    expect(sm.getStepTerminalBinding('nope', 'nope')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 3. State — PTY Open Grant
// ---------------------------------------------------------------------------

describe('state: PTY Open Grant', () => {
  it('grants and verifies PTY approval', () => {
    const sm = new RunStateManager()

    sm.grantPtyApproval('approval_1', 'pty_1')

    expect(sm.hasPtyApprovalGrant('approval_1', 'pty_1')).toBe(true)
    expect(sm.getActivePtyGrants()).toHaveLength(1)
  })

  it('deduplicates re-grants for same session', () => {
    const sm = new RunStateManager()

    sm.grantPtyApproval('approval_1', 'pty_1')
    sm.grantPtyApproval('approval_1', 'pty_1')

    expect(sm.getActivePtyGrants()).toHaveLength(1)
  })

  it('revokes grant on pty_destroy (by sessionId)', () => {
    const sm = new RunStateManager()

    sm.grantPtyApproval('approval_1', 'pty_1')
    sm.grantPtyApproval('approval_1', 'pty_2')
    sm.revokePtyApproval('pty_1')

    expect(sm.hasPtyApprovalGrant('approval_1', 'pty_1')).toBe(false)
    expect(sm.hasPtyApprovalGrant('approval_1', 'pty_2')).toBe(true)
    expect(sm.getActivePtyGrants()).toHaveLength(1)
  })

  it('revokes all grants for an approval session', () => {
    const sm = new RunStateManager()

    sm.grantPtyApproval('approval_1', 'pty_1')
    sm.grantPtyApproval('approval_1', 'pty_2')
    sm.grantPtyApproval('approval_2', 'pty_3')
    sm.revokeApprovalSession('approval_1')

    expect(sm.hasPtyApprovalGrant('approval_1', 'pty_1')).toBe(false)
    expect(sm.hasPtyApprovalGrant('approval_1', 'pty_2')).toBe(false)
    expect(sm.hasPtyApprovalGrant('approval_2', 'pty_3')).toBe(true)
    expect(sm.getActivePtyGrants()).toHaveLength(1)
  })

  it('re-activates a previously revoked grant', () => {
    const sm = new RunStateManager()

    sm.grantPtyApproval('a1', 'pty_1')
    sm.revokePtyApproval('pty_1')
    expect(sm.hasPtyApprovalGrant('a1', 'pty_1')).toBe(false)

    sm.grantPtyApproval('a1', 'pty_1')
    expect(sm.hasPtyApprovalGrant('a1', 'pty_1')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 4. State — PTY Audit Log
// ---------------------------------------------------------------------------

describe('state: PTY audit log', () => {
  it('appends audit entries with auto-timestamp', () => {
    const sm = new RunStateManager()

    sm.appendPtyAudit({
      taskId: 'task_1',
      stepId: 'step_a',
      ptySessionId: 'pty_1',
      event: 'create',
      cwd: '/tmp',
      rows: 24,
      cols: 80,
      pid: 1234,
    })

    const log = sm.getPtyAuditLog()
    expect(log).toHaveLength(1)
    expect(log[0].event).toBe('create')
    expect(log[0].at).toBeTruthy()
    expect(log[0].pid).toBe(1234)
  })

  it('send_input audit only records byte count + preview, not full content', () => {
    const sm = new RunStateManager()
    const longInput = 'x'.repeat(200)

    sm.appendPtyAudit({
      ptySessionId: 'pty_1',
      event: 'send_input',
      byteCount: longInput.length,
      inputPreview: longInput.length > 80 ? `${longInput.slice(0, 80)}…` : longInput,
    })

    const entry = sm.getPtyAuditLog()[0]
    expect(entry.byteCount).toBe(200)
    expect(entry.inputPreview!.length).toBeLessThanOrEqual(81) // 80 + ellipsis
    // Full content is NOT in the entry
    expect(entry).not.toHaveProperty('fullContent')
  })

  it('filters audit by session id', () => {
    const sm = new RunStateManager()

    sm.appendPtyAudit({ ptySessionId: 'pty_1', event: 'create' })
    sm.appendPtyAudit({ ptySessionId: 'pty_2', event: 'create' })
    sm.appendPtyAudit({ ptySessionId: 'pty_1', event: 'send_input', byteCount: 5 })
    sm.appendPtyAudit({ ptySessionId: 'pty_1', event: 'destroy', actor: 'tool_call', outcome: 'ok' })

    expect(sm.getPtyAuditForSession('pty_1')).toHaveLength(3)
    expect(sm.getPtyAuditForSession('pty_2')).toHaveLength(1)
    expect(sm.getPtyAuditForSession('pty_99')).toHaveLength(0)
  })

  it('records destroy with actor + outcome', () => {
    const sm = new RunStateManager()

    sm.appendPtyAudit({
      ptySessionId: 'pty_1',
      event: 'destroy',
      actor: 'tool_call',
      outcome: 'ok',
    })

    const entry = sm.getPtyAuditLog()[0]
    expect(entry.actor).toBe('tool_call')
    expect(entry.outcome).toBe('ok')
  })
})

// ---------------------------------------------------------------------------
// 5. State — PTY Session + stepId binding
// ---------------------------------------------------------------------------

describe('state: PTY session stepId binding', () => {
  it('bindPtySessionToStepId sets boundStepId on session', () => {
    const sm = new RunStateManager()

    sm.registerPtySession({
      id: 'pty_1',
      alive: true,
      rows: 24,
      cols: 80,
      pid: 100,
    })
    sm.bindPtySessionToStepId('pty_1', 'step_abc')

    const sessions = sm.getPtySessions()
    expect(sessions[0].boundStepId).toBe('step_abc')
  })

  it('does not crash when binding non-existent session', () => {
    const sm = new RunStateManager()
    // Should not throw
    sm.bindPtySessionToStepId('no_such', 'step_x')
    expect(sm.getPtySessions()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 6. State — RunState initialization
// ---------------------------------------------------------------------------

describe('state: RunState initialization', () => {
  it('initializes terminal lane arrays to empty', () => {
    const sm = new RunStateManager()
    const state = sm.getState()

    expect(state.workflowStepTerminalBindings).toEqual([])
    expect(state.ptyApprovalGrants).toEqual([])
    expect(state.ptyAuditLog).toEqual([])
    expect(state.recentSurfaceDecision).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 7. Support Matrix — Terminal Lane
// ---------------------------------------------------------------------------

describe('support matrix: terminal lane', () => {
  it('has entries in the terminal lane', () => {
    const terminalEntries = getByLane('terminal')
    expect(terminalEntries.length).toBeGreaterThanOrEqual(7)
  })

  it('has terminal_exec as product-supported', () => {
    const entry = supportMatrix.find(e => e.id === 'terminal_exec')
    expect(entry).toBeDefined()
    expect(entry!.level).toBe('product-supported')
    expect(entry!.lane).toBe('terminal')
  })

  it('has terminal_pty as product-supported', () => {
    const entry = supportMatrix.find(e => e.id === 'terminal_pty')
    expect(entry).toBeDefined()
    expect(entry!.level).toBe('product-supported')
    expect(entry!.lane).toBe('terminal')
  })

  it('has terminal_pty_self_acquire as product-supported', () => {
    const entry = supportMatrix.find(e => e.id === 'terminal_pty_self_acquire')
    expect(entry).toBeDefined()
    expect(entry!.level).toBe('product-supported')
    expect(entry!.lane).toBe('terminal')
  })

  it('has terminal_exec_to_pty_reroute as covered', () => {
    const entry = supportMatrix.find(e => e.id === 'terminal_exec_to_pty_reroute')
    expect(entry).toBeDefined()
    expect(entry!.level).toBe('covered')
    expect(entry!.lane).toBe('terminal')
  })

  it('has terminal_pty_open_grant as covered', () => {
    const entry = supportMatrix.find(e => e.id === 'terminal_pty_open_grant')
    expect(entry).toBeDefined()
    expect(entry!.level).toBe('covered')
    expect(entry!.lane).toBe('terminal')
  })

  it('has terminal_pty_audit as covered', () => {
    const entry = supportMatrix.find(e => e.id === 'terminal_pty_audit')
    expect(entry).toBeDefined()
    expect(entry!.level).toBe('covered')
    expect(entry!.lane).toBe('terminal')
  })

  it('has terminal_vscode_controller as covered', () => {
    const entry = supportMatrix.find(e => e.id === 'terminal_vscode_controller')
    expect(entry).toBeDefined()
    expect(entry!.level).toBe('covered')
    expect(entry!.lane).toBe('terminal')
  })

  it('has terminal_step_binding as covered', () => {
    const entry = supportMatrix.find(e => e.id === 'terminal_step_binding')
    expect(entry).toBeDefined()
    expect(entry!.level).toBe('covered')
    expect(entry!.lane).toBe('terminal')
  })

  it('terminal lane has a representative happy path', () => {
    const happy = getLaneHappyPath('terminal')
    expect(happy).toBeDefined()
  })

  it('product-supported terminal entries satisfy verification triple', () => {
    const failures = validateProductSupported()
    const terminalFailures = failures.filter(f => f.lane === 'terminal')
    expect(terminalFailures).toHaveLength(0)
  })

  it('does not duplicate terminal ids across the matrix', () => {
    const terminalIds = supportMatrix.filter(e => e.lane === 'terminal').map(e => e.id)
    expect(new Set(terminalIds).size).toBe(terminalIds.length)
  })
})

// ---------------------------------------------------------------------------
// 8. Support Matrix — overall invariants still hold with terminal lane
// ---------------------------------------------------------------------------

describe('support matrix: overall with terminal lane', () => {
  it('all five lanes have entries', () => {
    const lanes = ['workflow', 'browser', 'desktop-native', 'handoff', 'terminal'] as const
    for (const lane of lanes) {
      expect(getByLane(lane).length, `lane "${lane}" must have entries`).toBeGreaterThan(0)
    }
  })

  it('product-supported count increased with terminal entries', () => {
    const ps = getProductSupported()
    expect(ps.length).toBeGreaterThanOrEqual(4)
  })
})
