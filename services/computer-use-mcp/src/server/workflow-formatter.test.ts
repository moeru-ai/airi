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
    foregroundContext: { available: false, platform: 'darwin' },
    executionTarget: { mode: 'local-windowed', transport: 'local', hostName: 'mac', isolated: false, tainted: false },
    pendingApprovalCount: 0,
    lastApprovalRejected: false,
    ptySessions: [],
    workflowStepTerminalBindings: [],
    ptyApprovalGrants: [],
    ptyAuditLog: [],
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function createStep(overrides: Partial<WorkflowStepResult> = {}): WorkflowStepResult {
  return {
    step: { label: 'Test step', kind: 'take_screenshot', description: 'test', params: {} },
    advisories: [],
    succeeded: true,
    status: 'success',
    explanation: 'Step completed.',
    ...overrides,
  }
}

function createRerouteAdvisory(overrides: Partial<StrategyAdvisory> = {}): StrategyAdvisory {
  return {
    kind: 'use_accessibility_grounding',
    category: 'reroute',
    recommendedSurface: 'accessibility',
    reason: 'macOS accessibility tree provides structured UI element data.',
    suggestedToolName: 'accessibility_snapshot',
    ...overrides,
  }
}

function createResult(overrides: Partial<WorkflowExecutionResult> = {}): WorkflowExecutionResult {
  return {
    success: true,
    status: 'completed',
    task: { id: 'task-1', goal: 'test', phase: 'completed' as const, steps: [], startedAt: '', currentStepIndex: 0, failureCount: 0, maxConsecutiveFailures: 3 },
    stepResults: [createStep()],
    summary: 'Workflow completed.',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('formatWorkflowStructuredContent', () => {
  it('emits kind=workflow_result and status=completed for a successful workflow', () => {
    const output = formatWorkflowStructuredContent({
      workflowId: 'wf-1',
      result: createResult(),
      runState: createBaseRunState(),
    })

    expect(output.kind).toBe('workflow_result')
    expect(output.status).toBe('completed')
    expect(output.workflow).toBe('wf-1')
    expect(output).not.toHaveProperty('reroute')
  })

  it('emits kind=workflow_result and status=failed for a failed workflow', () => {
    const output = formatWorkflowStructuredContent({
      workflowId: 'wf-2',
      result: createResult({ success: false, status: 'failed' }),
      runState: createBaseRunState(),
    })

    expect(output.kind).toBe('workflow_result')
    expect(output.status).toBe('failed')
  })

  it('emits kind=workflow_result and status=paused with resumeHint for suspended workflow', () => {
    const suspension: WorkflowSuspension = {
      workflow: { id: 'wf-3', name: 'test', description: 'test', steps: [], maxRetries: 0 },
      pausedAtStepIndex: 1,
      resumeAtStepIndex: 1,
      pausedDuring: 'main_action',
      stepResults: [],
      task: { id: 'task-1', goal: 'test', phase: 'awaiting_approval' as const, steps: [], startedAt: '', currentStepIndex: 1, failureCount: 0, maxConsecutiveFailures: 3 },
    }

    const output = formatWorkflowStructuredContent({
      workflowId: 'wf-3',
      result: createResult({
        success: false,
        status: 'paused',
        suspension,
      }),
      runState: createBaseRunState(),
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
        workflowId: 'wf-reroute-1',
        result: createResult({
          success: false,
          status: 'reroute_required',
          rerouteAdvisory: advisory,
          stepResults: [createStep({ status: 'reroute_required', succeeded: false })],
        }),
        runState: createBaseRunState(),
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
        workflowId: 'wf-reroute-2',
        result: createResult({
          success: false,
          status: 'reroute_required',
          rerouteAdvisory: createRerouteAdvisory(),
          stepResults: [createStep({
            status: 'reroute_required',
            succeeded: false,
            preparatoryResults: [
              { toolName: 'accessibility_snapshot', succeeded: true },
            ],
          })],
        }),
        runState: createBaseRunState(),
      })

      expect((output as any).reroute.executionReason).toBeUndefined()
    })

    it('does not fabricate executionReason from generic metadata', () => {
      // Even when metadata exists, the formatter must not construct a
      // template sentence. Only an explicit `executionReason` string in
      // metadata is forwarded.
      const output = formatWorkflowStructuredContent({
        workflowId: 'wf-reroute-3',
        result: createResult({
          success: false,
          status: 'reroute_required',
          rerouteAdvisory: createRerouteAdvisory(),
          stepResults: [createStep({
            status: 'reroute_required',
            succeeded: false,
            preparatoryResults: [
              {
                toolName: 'accessibility_snapshot',
                succeeded: true,
                metadata: { elementCount: 42 },
              },
            ],
          })],
        }),
        runState: createBaseRunState(),
      })

      expect((output as any).reroute.executionReason).toBeUndefined()
    })

    it('forwards explicit executionReason from prep metadata', () => {
      const output = formatWorkflowStructuredContent({
        workflowId: 'wf-reroute-3b',
        result: createResult({
          success: false,
          status: 'reroute_required',
          rerouteAdvisory: createRerouteAdvisory(),
          stepResults: [createStep({
            status: 'reroute_required',
            succeeded: false,
            preparatoryResults: [
              {
                toolName: 'accessibility_snapshot',
                succeeded: true,
                metadata: { executionReason: 'Browser confirmed running with 3 tabs.' },
              },
            ],
          })],
        }),
        runState: createBaseRunState(),
      })

      expect((output as any).reroute.executionReason).toBe('Browser confirmed running with 3 tabs.')
    })

    it('includes availableSurfaces and preferredSurface for browser_dom reroute', () => {
      const output = formatWorkflowStructuredContent({
        workflowId: 'wf-reroute-browser',
        result: createResult({
          success: false,
          status: 'reroute_required',
          rerouteAdvisory: createRerouteAdvisory({
            kind: 'use_browser_surface',
            recommendedSurface: 'browser_dom',
            suggestedToolName: 'browser_dom_read_page',
            reason: 'Extension DOM stack is preferred.',
          }),
          stepResults: [createStep({ status: 'reroute_required', succeeded: false })],
        }),
        runState: createBaseRunState({
          browserSurfaceAvailability: {
            executionMode: 'local-windowed',
            suitable: true,
            availableSurfaces: ['browser_dom', 'browser_cdp'],
            preferredSurface: 'browser_dom',
            selectedToolName: 'browser_dom_read_page',
            reason: 'Extension is connected.',
            extension: { enabled: true, connected: true },
            cdp: { endpoint: 'http://localhost:9222', connected: false, connectable: true },
          },
        }),
      })

      const reroute = (output as any).reroute
      expect(reroute.availableSurfaces).toEqual(['browser_dom', 'browser_cdp'])
      expect(reroute.preferredSurface).toBe('browser_dom')
    })

    it('includes availableSurfaces and preferredSurface for browser_cdp reroute', () => {
      const output = formatWorkflowStructuredContent({
        workflowId: 'wf-reroute-cdp',
        result: createResult({
          success: false,
          status: 'reroute_required',
          rerouteAdvisory: createRerouteAdvisory({
            kind: 'use_browser_surface',
            recommendedSurface: 'browser_cdp',
            suggestedToolName: 'browser_cdp_collect_elements',
            reason: 'CDP is connected.',
          }),
          stepResults: [createStep({ status: 'reroute_required', succeeded: false })],
        }),
        runState: createBaseRunState({
          browserSurfaceAvailability: {
            executionMode: 'local-windowed',
            suitable: true,
            availableSurfaces: ['browser_cdp'],
            preferredSurface: 'browser_cdp',
            selectedToolName: 'browser_cdp_collect_elements',
            reason: 'CDP is connected.',
            extension: { enabled: false, connected: false },
            cdp: { endpoint: 'http://localhost:9222', connected: true, connectable: true },
          },
        }),
      })

      const reroute = (output as any).reroute
      expect(reroute.availableSurfaces).toEqual(['browser_cdp'])
      expect(reroute.preferredSurface).toBe('browser_cdp')
    })

    it('does not include availableSurfaces for non-browser reroute', () => {
      const output = formatWorkflowStructuredContent({
        workflowId: 'wf-reroute-a11y',
        result: createResult({
          success: false,
          status: 'reroute_required',
          rerouteAdvisory: createRerouteAdvisory(),
          stepResults: [createStep({ status: 'reroute_required', succeeded: false })],
        }),
        runState: createBaseRunState({
          browserSurfaceAvailability: {
            executionMode: 'local-windowed',
            suitable: true,
            availableSurfaces: ['browser_dom'],
            preferredSurface: 'browser_dom',
            selectedToolName: 'browser_dom_read_page',
            reason: 'Extension is connected.',
            extension: { enabled: true, connected: true },
            cdp: { endpoint: 'http://localhost:9222', connected: false, connectable: true },
          },
        }),
      })

      const reroute = (output as any).reroute
      expect(reroute.availableSurfaces).toBeUndefined()
      expect(reroute.preferredSurface).toBeUndefined()
    })

    it('includes terminalSurface and ptySessionId for PTY reroute', () => {
      const output = formatWorkflowStructuredContent({
        workflowId: 'wf-reroute-pty',
        result: createResult({
          success: false,
          status: 'reroute_required',
          rerouteAdvisory: createRerouteAdvisory({
            kind: 'use_pty_surface',
            recommendedSurface: 'pty',
            suggestedToolName: 'pty_read_screen',
            reason: 'Interactive session should continue on PTY.',
          }),
          stepResults: [createStep({ status: 'reroute_required', succeeded: false })],
        }),
        runState: createBaseRunState({
          activePtySessionId: 'pty_7',
        }),
      })

      const reroute = (output as any).reroute
      expect(reroute.terminalSurface).toBe('pty')
      expect(reroute.ptySessionId).toBe('pty_7')
    })

    it('workflow_resume does not emit reroute for completed continuation', () => {
      const output = formatWorkflowStructuredContent({
        workflowId: 'wf-resume',
        result: createResult({
          success: true,
          status: 'completed',
          summary: 'Resumed and completed.',
        }),
        runState: createBaseRunState(),
      })

      expect(output.kind).toBe('workflow_result')
      expect(output.status).toBe('completed')
      expect(output).not.toHaveProperty('reroute')
    })
  })
})
