import type { RunState } from '../state'
import type { StrategyAdvisory } from '../strategy'
import type { WorkflowExecutionResult, WorkflowStepResult, WorkflowSuspension } from '../workflows/engine'

import { describe, expect, it } from 'vitest'

import { formatWorkflowStructuredContent } from './workflow-formatter'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createBaseRunState(overrides: Partial<RunState> = {}): RunState {
  return {
    executionTarget: { hostName: 'mac', isolated: false, mode: 'local-windowed', tainted: false, transport: 'local' },
    foregroundContext: { available: false, platform: 'darwin' },
    lastApprovalRejected: false,
    pendingApprovalCount: 0,
    ptyApprovalGrants: [],
    ptyAuditLog: [],
    ptySessions: [],
    updatedAt: new Date().toISOString(),
    workflowStepTerminalBindings: [],
    ...overrides,
  }
}

function createRerouteAdvisory(overrides: Partial<StrategyAdvisory> = {}): StrategyAdvisory {
  return {
    category: 'reroute',
    kind: 'use_accessibility_grounding',
    reason: 'macOS accessibility tree provides structured UI element data.',
    recommendedSurface: 'accessibility',
    suggestedToolName: 'accessibility_snapshot',
    ...overrides,
  }
}

function createResult(overrides: Partial<WorkflowExecutionResult> = {}): WorkflowExecutionResult {
  return {
    status: 'completed',
    stepResults: [createStep()],
    success: true,
    summary: 'Workflow completed.',
    task: { currentStepIndex: 0, failureCount: 0, goal: 'test', id: 'task-1', maxConsecutiveFailures: 3, phase: 'completed' as const, startedAt: '', steps: [] },
    ...overrides,
  }
}

function createStep(overrides: Partial<WorkflowStepResult> = {}): WorkflowStepResult {
  return {
    advisories: [],
    explanation: 'Step completed.',
    status: 'success',
    step: { description: 'test', kind: 'take_screenshot', label: 'Test step', params: {} },
    succeeded: true,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('formatWorkflowStructuredContent', () => {
  it('emits kind=workflow_result and status=completed for a successful workflow', () => {
    const output = formatWorkflowStructuredContent({
      result: createResult(),
      runState: createBaseRunState(),
      workflowId: 'wf-1',
    })

    expect(output.kind).toBe('workflow_result')
    expect(output.status).toBe('completed')
    expect(output.workflow).toBe('wf-1')
    expect(output).not.toHaveProperty('reroute')
  })

  it('emits kind=workflow_result and status=failed for a failed workflow', () => {
    const output = formatWorkflowStructuredContent({
      result: createResult({ status: 'failed', success: false }),
      runState: createBaseRunState(),
      workflowId: 'wf-2',
    })

    expect(output.kind).toBe('workflow_result')
    expect(output.status).toBe('failed')
  })

  it('emits kind=workflow_result and status=paused with resumeHint for suspended workflow', () => {
    const suspension: WorkflowSuspension = {
      pausedAtStepIndex: 1,
      pausedDuring: 'main_action',
      resumeAtStepIndex: 1,
      stepResults: [],
      task: { currentStepIndex: 1, failureCount: 0, goal: 'test', id: 'task-1', maxConsecutiveFailures: 3, phase: 'awaiting_approval' as const, startedAt: '', steps: [] },
      workflow: { description: 'test', id: 'wf-3', maxRetries: 0, name: 'test', steps: [] },
    }

    const output = formatWorkflowStructuredContent({
      result: createResult({
        status: 'paused',
        success: false,
        suspension,
      }),
      runState: createBaseRunState(),
      workflowId: 'wf-3',
    })

    expect(output.kind).toBe('workflow_result')
    expect(output.status).toBe('paused')
    expect(output).toHaveProperty('resumeHint')
    expect(output).toHaveProperty('pausedAtStep', 1)
    expect(output).not.toHaveProperty('reroute')
  })

  describe('reroute contract', () => {
    it('emits kind=workflow_reroute with stable reroute detail for accessibility reroute', () => {
      const advisory = createRerouteAdvisory()
      const output = formatWorkflowStructuredContent({
        result: createResult({
          rerouteAdvisory: advisory,
          status: 'reroute_required',
          stepResults: [createStep({ status: 'reroute_required', succeeded: false })],
          success: false,
        }),
        runState: createBaseRunState(),
        workflowId: 'wf-reroute-1',
      })

      expect(output.kind).toBe('workflow_reroute')
      expect(output.status).toBe('reroute_required')
      expect(output).toHaveProperty('reroute')

      const reroute = (output as any).reroute
      expect(reroute.recommendedSurface).toBe('accessibility')
      expect(reroute.suggestedTool).toBe('accessibility_snapshot')
      expect(reroute.strategyReason).toBe(advisory.reason)
      expect(reroute.explanation).toContain('stopped safely')
      expect(reroute.explanation).toContain(advisory.reason)
    })

    it('does not include executionReason for pure strategy reroute (no prep metadata)', () => {
      const output = formatWorkflowStructuredContent({
        result: createResult({
          rerouteAdvisory: createRerouteAdvisory(),
          status: 'reroute_required',
          stepResults: [createStep({
            preparatoryResults: [
              { succeeded: true, toolName: 'accessibility_snapshot' },
            ],
            status: 'reroute_required',
            succeeded: false,
          })],
          success: false,
        }),
        runState: createBaseRunState(),
        workflowId: 'wf-reroute-2',
      })

      expect((output as any).reroute.executionReason).toBeUndefined()
    })

    it('does not fabricate executionReason from generic metadata', () => {
      // Even when metadata exists, the formatter must not construct a
      // template sentence. Only an explicit `executionReason` string in
      // metadata is forwarded.
      const output = formatWorkflowStructuredContent({
        result: createResult({
          rerouteAdvisory: createRerouteAdvisory(),
          status: 'reroute_required',
          stepResults: [createStep({
            preparatoryResults: [
              {
                metadata: { elementCount: 42 },
                succeeded: true,
                toolName: 'accessibility_snapshot',
              },
            ],
            status: 'reroute_required',
            succeeded: false,
          })],
          success: false,
        }),
        runState: createBaseRunState(),
        workflowId: 'wf-reroute-3',
      })

      expect((output as any).reroute.executionReason).toBeUndefined()
    })

    it('forwards explicit executionReason from prep metadata', () => {
      const output = formatWorkflowStructuredContent({
        result: createResult({
          rerouteAdvisory: createRerouteAdvisory(),
          status: 'reroute_required',
          stepResults: [createStep({
            preparatoryResults: [
              {
                metadata: { executionReason: 'Browser confirmed running with 3 tabs.' },
                succeeded: true,
                toolName: 'accessibility_snapshot',
              },
            ],
            status: 'reroute_required',
            succeeded: false,
          })],
          success: false,
        }),
        runState: createBaseRunState(),
        workflowId: 'wf-reroute-3b',
      })

      expect((output as any).reroute.executionReason).toBe('Browser confirmed running with 3 tabs.')
    })

    it('includes availableSurfaces and preferredSurface for browser_dom reroute', () => {
      const output = formatWorkflowStructuredContent({
        result: createResult({
          rerouteAdvisory: createRerouteAdvisory({
            kind: 'use_browser_surface',
            reason: 'Extension DOM stack is preferred.',
            recommendedSurface: 'browser_dom',
            suggestedToolName: 'browser_dom_read_page',
          }),
          status: 'reroute_required',
          stepResults: [createStep({ status: 'reroute_required', succeeded: false })],
          success: false,
        }),
        runState: createBaseRunState({
          browserSurfaceAvailability: {
            availableSurfaces: ['browser_dom', 'browser_cdp'],
            cdp: { connectable: true, connected: false, endpoint: 'http://localhost:9222' },
            executionMode: 'local-windowed',
            extension: { connected: true, enabled: true },
            preferredSurface: 'browser_dom',
            reason: 'Extension is connected.',
            selectedToolName: 'browser_dom_read_page',
            suitable: true,
          },
        }),
        workflowId: 'wf-reroute-browser',
      })

      const reroute = (output as any).reroute
      expect(reroute.availableSurfaces).toEqual(['browser_dom', 'browser_cdp'])
      expect(reroute.preferredSurface).toBe('browser_dom')
    })

    it('includes availableSurfaces and preferredSurface for browser_cdp reroute', () => {
      const output = formatWorkflowStructuredContent({
        result: createResult({
          rerouteAdvisory: createRerouteAdvisory({
            kind: 'use_browser_surface',
            reason: 'CDP is connected.',
            recommendedSurface: 'browser_cdp',
            suggestedToolName: 'browser_cdp_collect_elements',
          }),
          status: 'reroute_required',
          stepResults: [createStep({ status: 'reroute_required', succeeded: false })],
          success: false,
        }),
        runState: createBaseRunState({
          browserSurfaceAvailability: {
            availableSurfaces: ['browser_cdp'],
            cdp: { connectable: true, connected: true, endpoint: 'http://localhost:9222' },
            executionMode: 'local-windowed',
            extension: { connected: false, enabled: false },
            preferredSurface: 'browser_cdp',
            reason: 'CDP is connected.',
            selectedToolName: 'browser_cdp_collect_elements',
            suitable: true,
          },
        }),
        workflowId: 'wf-reroute-cdp',
      })

      const reroute = (output as any).reroute
      expect(reroute.availableSurfaces).toEqual(['browser_cdp'])
      expect(reroute.preferredSurface).toBe('browser_cdp')
    })

    it('does not include availableSurfaces for non-browser reroute', () => {
      const output = formatWorkflowStructuredContent({
        result: createResult({
          rerouteAdvisory: createRerouteAdvisory(),
          status: 'reroute_required',
          stepResults: [createStep({ status: 'reroute_required', succeeded: false })],
          success: false,
        }),
        runState: createBaseRunState({
          browserSurfaceAvailability: {
            availableSurfaces: ['browser_dom'],
            cdp: { connectable: true, connected: false, endpoint: 'http://localhost:9222' },
            executionMode: 'local-windowed',
            extension: { connected: true, enabled: true },
            preferredSurface: 'browser_dom',
            reason: 'Extension is connected.',
            selectedToolName: 'browser_dom_read_page',
            suitable: true,
          },
        }),
        workflowId: 'wf-reroute-a11y',
      })

      const reroute = (output as any).reroute
      expect(reroute.availableSurfaces).toBeUndefined()
      expect(reroute.preferredSurface).toBeUndefined()
    })

    it('includes terminalSurface and ptySessionId for PTY reroute', () => {
      const output = formatWorkflowStructuredContent({
        result: createResult({
          rerouteAdvisory: createRerouteAdvisory({
            kind: 'use_pty_surface',
            reason: 'Interactive session should continue on PTY.',
            recommendedSurface: 'pty',
            suggestedToolName: 'pty_read_screen',
          }),
          status: 'reroute_required',
          stepResults: [createStep({ status: 'reroute_required', succeeded: false })],
          success: false,
        }),
        runState: createBaseRunState({
          activePtySessionId: 'pty_7',
        }),
        workflowId: 'wf-reroute-pty',
      })

      const reroute = (output as any).reroute
      expect(reroute.terminalSurface).toBe('pty')
      expect(reroute.ptySessionId).toBe('pty_7')
    })

    it('workflow_resume does not emit reroute for completed continuation', () => {
      const output = formatWorkflowStructuredContent({
        result: createResult({
          status: 'completed',
          success: true,
          summary: 'Resumed and completed.',
        }),
        runState: createBaseRunState(),
        workflowId: 'wf-resume',
      })

      expect(output.kind).toBe('workflow_result')
      expect(output.status).toBe('completed')
      expect(output).not.toHaveProperty('reroute')
    })
  })
})
