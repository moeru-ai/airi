/**
 * Workflow engine tests — covers executeWorkflow, approval_required → suspension,
 * and resumeWorkflow continuation.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { ExecuteAction } from '../server/action-executor'
import type { WorkflowDefinition } from './types'

import { describe, expect, it, vi } from 'vitest'

import { RunStateManager } from '../state'
import { executeWorkflow, resumeWorkflow } from './engine'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSuccessResult(text = 'ok'): CallToolResult {
  return { content: [{ type: 'text', text }] }
}

function makeApprovalRequiredResult(): CallToolResult {
  return {
    content: [{ type: 'text', text: 'Approval required for this action.' }],
    structuredContent: { status: 'approval_required' } as unknown as CallToolResult['structuredContent'],
  }
}

function makeErrorResult(text = 'something went wrong'): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    isError: true,
  }
}

function makePrepSuccessResult(structuredContent: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: 'prep ok' }],
    structuredContent: structuredContent as CallToolResult['structuredContent'],
  }
}

function makeTwoStepWorkflow(): WorkflowDefinition {
  return {
    id: 'test_two_step',
    name: 'Two Step Test',
    description: 'A simple two-step workflow for testing.',
    maxRetries: 3,
    steps: [
      { label: 'Step 1', kind: 'run_command', description: 'Run step 1', params: { command: 'echo step1' } },
      { label: 'Step 2', kind: 'run_command', description: 'Run step 2', params: { command: 'echo step2' } },
    ],
  }
}

function makeThreeStepWorkflowWithApproval(): WorkflowDefinition {
  return {
    id: 'test_approval',
    name: 'Approval Test',
    description: 'Three steps; second returns approval_required.',
    maxRetries: 3,
    steps: [
      { label: 'Step 1', kind: 'run_command', description: 'Run step 1', params: { command: 'echo a' } },
      { label: 'Step 2 (needs approval)', kind: 'run_command', description: 'Run step 2', params: { command: 'echo b' } },
      { label: 'Step 3', kind: 'run_command', description: 'Run step 3', params: { command: 'echo c' } },
    ],
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('workflow engine', () => {
  it('completes a simple two-step workflow successfully', async () => {
    const executeAction: ExecuteAction = vi.fn().mockResolvedValue(makeSuccessResult())
    const sm = new RunStateManager()

    const result = await executeWorkflow({
      workflow: makeTwoStepWorkflow(),
      executeAction,
      stateManager: sm,
    })

    expect(result.success).toBe(true)
    expect(result.stepResults).toHaveLength(2)
    expect(result.stepResults.every(r => r.succeeded)).toBe(true)
    expect(result.suspension).toBeUndefined()
    expect(executeAction).toHaveBeenCalledTimes(2)
  })

  it('returns suspension when a step requires approval', async () => {
    const wf = makeThreeStepWorkflowWithApproval()
    let callIndex = 0
    const executeAction: ExecuteAction = vi.fn().mockImplementation(async () => {
      callIndex++
      // Second action returns approval_required
      if (callIndex === 2)
        return makeApprovalRequiredResult()
      return makeSuccessResult()
    })
    const sm = new RunStateManager()

    const result = await executeWorkflow({
      workflow: wf,
      executeAction,
      stateManager: sm,
    })

    expect(result.success).toBe(false)
    expect(result.suspension).toBeDefined()
    expect(result.suspension!.pausedAtStepIndex).toBe(1)
    // Only steps 1 and 2 were executed; step 3 has not started
    expect(result.stepResults).toHaveLength(2)
    // Step 2 didn't succeed (awaiting approval)
    expect(result.stepResults[1]!.succeeded).toBe(false)
  })

  it('resumes workflow after approval and completes remaining steps', async () => {
    const wf = makeThreeStepWorkflowWithApproval()
    let callIndex = 0
    const executeAction: ExecuteAction = vi.fn().mockImplementation(async () => {
      callIndex++
      if (callIndex === 2)
        return makeApprovalRequiredResult()
      return makeSuccessResult()
    })
    const sm = new RunStateManager()

    // Execute until suspension
    const initial = await executeWorkflow({
      workflow: wf,
      executeAction,
      stateManager: sm,
    })
    expect(initial.suspension).toBeDefined()

    // Resume with approval
    const resumed = await resumeWorkflow({
      suspension: initial.suspension!,
      executeAction,
      stateManager: sm,
      approved: true,
    })

    expect(resumed.success).toBe(true)
    // Step 3 was executed after resume
    expect(resumed.stepResults).toHaveLength(3)
    expect(resumed.stepResults[2]!.succeeded).toBe(true)
    // Total executeAction calls: step1 + step2(approval) + step3(resume)
    expect(executeAction).toHaveBeenCalledTimes(3)
  })

  it('fails workflow when resume is rejected', async () => {
    const wf = makeThreeStepWorkflowWithApproval()
    let callIndex = 0
    const executeAction: ExecuteAction = vi.fn().mockImplementation(async () => {
      callIndex++
      if (callIndex === 2)
        return makeApprovalRequiredResult()
      return makeSuccessResult()
    })
    const sm = new RunStateManager()

    const initial = await executeWorkflow({
      workflow: wf,
      executeAction,
      stateManager: sm,
    })
    expect(initial.suspension).toBeDefined()

    const resumed = await resumeWorkflow({
      suspension: initial.suspension!,
      executeAction,
      stateManager: sm,
      approved: false,
    })

    expect(resumed.success).toBe(false)
    expect(resumed.task.phase).toBe('failed')
    // Step 3 should not have been executed
    expect(resumed.stepResults).toHaveLength(2)
    // executeAction was not called again for step 3
    expect(executeAction).toHaveBeenCalledTimes(2)
  })

  it('aborts on critical step failure', async () => {
    const wf: WorkflowDefinition = {
      id: 'test_critical',
      name: 'Critical Failure Test',
      description: 'A critical step fails.',
      maxRetries: 3,
      steps: [
        { label: 'Step 1', kind: 'run_command', description: 'Run step 1', params: { command: 'echo a' } },
        { label: 'Step 2 (critical)', kind: 'run_command', description: 'Critical step', params: { command: 'bad' }, critical: true },
        { label: 'Step 3', kind: 'run_command', description: 'Should not run', params: { command: 'echo c' } },
      ],
    }

    let callIndex = 0
    const executeAction: ExecuteAction = vi.fn().mockImplementation(async () => {
      callIndex++
      if (callIndex === 2)
        return makeErrorResult('critical failure')
      return makeSuccessResult()
    })
    const sm = new RunStateManager()

    const result = await executeWorkflow({
      workflow: wf,
      executeAction,
      stateManager: sm,
    })

    expect(result.success).toBe(false)
    expect(result.task.phase).toBe('failed')
    // Steps 1 and 2 executed; step 3 skipped due to critical failure
    expect(result.stepResults).toHaveLength(2)
    expect(result.stepResults[0]!.succeeded).toBe(true)
    expect(result.stepResults[1]!.succeeded).toBe(false)
    expect(executeAction).toHaveBeenCalledTimes(2)
  })

  it('resumes with autoApproveSteps to skip further approvals', async () => {
    const wf: WorkflowDefinition = {
      id: 'test_auto_approve',
      name: 'Auto Approve Test',
      description: 'Two approval steps; second should be auto-approved on resume.',
      maxRetries: 3,
      steps: [
        { label: 'Step 1', kind: 'run_command', description: 'Step 1', params: { command: 'echo a' } },
        { label: 'Step 2 (approval)', kind: 'run_command', description: 'Needs approval', params: { command: 'echo b' } },
        { label: 'Step 3', kind: 'run_command', description: 'Step 3', params: { command: 'echo c' } },
      ],
    }

    let callIndex = 0
    const executeAction: ExecuteAction = vi.fn().mockImplementation(async () => {
      callIndex++
      if (callIndex === 2)
        return makeApprovalRequiredResult()
      return makeSuccessResult()
    })
    const sm = new RunStateManager()

    const initial = await executeWorkflow({
      workflow: wf,
      executeAction,
      stateManager: sm,
    })

    // Resume with autoApproveSteps
    const resumed = await resumeWorkflow({
      suspension: initial.suspension!,
      executeAction,
      stateManager: sm,
      approved: true,
      autoApproveSteps: true,
    })

    expect(resumed.success).toBe(true)
    expect(resumed.stepResults).toHaveLength(3)
    // autoApproveSteps was passed through to executeWorkflow
    expect(executeAction).toHaveBeenCalledTimes(3)
  })

  // -----------------------------------------------------------------------
  // Status field tests
  // -----------------------------------------------------------------------

  it('includes status field in execution result', async () => {
    const executeAction: ExecuteAction = vi.fn().mockResolvedValue(makeSuccessResult())
    const sm = new RunStateManager()

    const result = await executeWorkflow({
      workflow: makeTwoStepWorkflow(),
      executeAction,
      stateManager: sm,
    })

    expect(result.status).toBe('completed')
    expect(result.stepResults[0]!.status).toBe('success')
    expect(result.stepResults[1]!.status).toBe('success')
  })

  it('returns failed status on step failure', async () => {
    const wf: WorkflowDefinition = {
      id: 'test_fail_status',
      name: 'Fail Status Test',
      description: 'A critical step fails.',
      maxRetries: 3,
      steps: [
        { label: 'Step 1 (critical)', kind: 'run_command', description: 'Critical fail', params: { command: 'bad' }, critical: true },
      ],
    }

    const executeAction: ExecuteAction = vi.fn().mockResolvedValue(makeErrorResult('boom'))
    const sm = new RunStateManager()

    const result = await executeWorkflow({
      workflow: wf,
      executeAction,
      stateManager: sm,
    })

    expect(result.status).toBe('failed')
    expect(result.stepResults[0]!.status).toBe('failure')
  })

  it('returns paused status on approval suspension', async () => {
    const wf = makeThreeStepWorkflowWithApproval()
    let callIndex = 0
    const executeAction: ExecuteAction = vi.fn().mockImplementation(async () => {
      callIndex++
      if (callIndex === 2)
        return makeApprovalRequiredResult()
      return makeSuccessResult()
    })
    const sm = new RunStateManager()

    const result = await executeWorkflow({
      workflow: wf,
      executeAction,
      stateManager: sm,
    })

    expect(result.status).toBe('paused')
    expect(result.stepResults[1]!.status).toBe('pending_approval')
  })

  // -----------------------------------------------------------------------
  // failureCount double-counting fix
  // -----------------------------------------------------------------------

  it('does not double-count failures (completeCurrentStep already increments)', async () => {
    const wf: WorkflowDefinition = {
      id: 'test_failure_count',
      name: 'Failure Count Test',
      description: 'Two steps, first fails.',
      maxRetries: 5,
      steps: [
        { label: 'Step 1', kind: 'run_command', description: 'Fails', params: { command: 'bad' } },
        { label: 'Step 2', kind: 'run_command', description: 'Succeeds', params: { command: 'echo ok' } },
      ],
    }

    let callIndex = 0
    const executeAction: ExecuteAction = vi.fn().mockImplementation(async () => {
      callIndex++
      if (callIndex === 1)
        return makeErrorResult('fail')
      return makeSuccessResult()
    })
    const sm = new RunStateManager()

    const result = await executeWorkflow({
      workflow: wf,
      executeAction,
      stateManager: sm,
    })

    // failureCount should be 1 (not 2 from double-counting)
    expect(result.task.failureCount).toBe(1)
  })

  // -----------------------------------------------------------------------
  // Prep pipeline + reroute tests
  // -----------------------------------------------------------------------

  it('triggers reroute when strategy advises browser surface for browser foreground', async () => {
    const wf: WorkflowDefinition = {
      id: 'test_reroute',
      name: 'Reroute Test',
      description: 'Click in browser triggers reroute.',
      maxRetries: 3,
      steps: [
        { label: 'Click in browser', kind: 'click_element', description: 'Click button', params: { x: 100, y: 100 } },
      ],
    }

    const executeAction: ExecuteAction = vi.fn().mockResolvedValue(makeSuccessResult())
    const executePrepTool = vi.fn().mockResolvedValue(makePrepSuccessResult({
      status: 'ok',
      elementCount: 4,
      page: { title: 'Example', url: 'https://example.com' },
    }))
    const sm = new RunStateManager()
    // Set browser foreground context so strategy emits use_browser_surface (reroute)
    sm.updateForegroundContext({
      available: true,
      appName: 'Google Chrome',
      platform: 'darwin',
    })
    sm.updateBrowserSurfaceAvailability({
      executionMode: 'local-windowed',
      suitable: true,
      availableSurfaces: ['browser_dom'],
      preferredSurface: 'browser_dom',
      selectedToolName: 'browser_dom_read_page',
      reason: 'Browser extension bridge is already connected.',
      extension: {
        enabled: true,
        connected: true,
      },
      cdp: {
        endpoint: 'http://localhost:9222',
        connected: true,
        connectable: true,
      },
    })
    sm.updateDisplayInfo({
      available: true,
      platform: 'darwin',
      logicalWidth: 1728,
      logicalHeight: 1117,
    })

    const result = await executeWorkflow({
      workflow: wf,
      executeAction,
      executePrepTool,
      stateManager: sm,
    })

    expect(result.status).toBe('reroute_required')
    expect(result.success).toBe(false)
    expect(result.rerouteAdvisory).toBeDefined()
    expect(result.rerouteAdvisory!.kind).toBe('use_browser_surface')
    expect(result.rerouteAdvisory!.recommendedSurface).toBe('browser_dom')
    expect(result.stepResults[0]!.status).toBe('reroute_required')
    expect(result.stepResults[0]!.preparatoryResults).toEqual([
      expect.objectContaining({
        toolName: 'browser_dom_read_page',
        succeeded: true,
        metadata: expect.objectContaining({
          frameCount: undefined,
        }),
      }),
    ])
    expect(executePrepTool).toHaveBeenCalledWith('browser_dom_read_page', { skipApprovalQueue: false })
    expect(executeAction).not.toHaveBeenCalled()
  })

  it('runs action-prep before browser reroute evaluation and avoids stale reroute after focusing', async () => {
    const wf: WorkflowDefinition = {
      id: 'test_action_prep_before_reroute',
      name: 'Action Prep Before Reroute Test',
      description: 'Focus target app before deciding on browser reroute.',
      maxRetries: 3,
      steps: [
        { label: 'Click in Cursor', kind: 'click_element', description: 'Click button', params: { x: 100, y: 100 } },
      ],
    }

    const sm = new RunStateManager()
    sm.updateForegroundContext({
      available: true,
      appName: 'Google Chrome',
      platform: 'darwin',
    })
    sm.updateDisplayInfo({
      available: true,
      platform: 'darwin',
      logicalWidth: 1728,
      logicalHeight: 1117,
    })
    sm.updateBrowserSurfaceAvailability({
      executionMode: 'local-windowed',
      suitable: true,
      availableSurfaces: ['browser_dom'],
      preferredSurface: 'browser_dom',
      selectedToolName: 'browser_dom_read_page',
      reason: 'Browser extension bridge is already connected.',
      extension: {
        enabled: true,
        connected: true,
      },
      cdp: {
        endpoint: 'http://localhost:9222',
        connected: true,
        connectable: true,
      },
    })

    const executeAction: ExecuteAction = vi.fn().mockImplementation(async (action, toolName) => {
      if (toolName === 'prep_focus_app_first') {
        sm.updateForegroundContext({
          available: true,
          appName: 'Cursor',
          platform: 'darwin',
        })
        return makeSuccessResult('focused')
      }

      return makeSuccessResult(`executed ${action.kind}`)
    })
    const executePrepTool = vi.fn().mockResolvedValue(makePrepSuccessResult({ status: 'ok' }))

    const result = await executeWorkflow({
      workflow: wf,
      executeAction,
      executePrepTool,
      stateManager: sm,
    })

    expect(result.success).toBe(true)
    expect(result.status).toBe('completed')
    expect(executeAction).toHaveBeenCalledTimes(2)
    expect(executeAction).toHaveBeenNthCalledWith(
      1,
      { kind: 'focus_app', input: { app: 'Cursor' } },
      'prep_focus_app_first',
      { skipApprovalQueue: false },
    )
    expect(executePrepTool).not.toHaveBeenCalled()
  })

  it('pauses the workflow when action-prep requires approval and resumes the same step later', async () => {
    const wf: WorkflowDefinition = {
      id: 'test_action_prep_approval',
      name: 'Action Prep Approval Test',
      description: 'Focus requires approval before main action.',
      maxRetries: 3,
      steps: [
        { label: 'Click in Cursor', kind: 'click_element', description: 'Click button', params: { x: 100, y: 100 } },
      ],
    }

    const sm = new RunStateManager()
    sm.updateForegroundContext({
      available: true,
      appName: 'Google Chrome',
      platform: 'darwin',
    })
    sm.updateDisplayInfo({
      available: true,
      platform: 'darwin',
      logicalWidth: 1728,
      logicalHeight: 1117,
    })

    const executeAction: ExecuteAction = vi.fn().mockImplementation(async (_, toolName) => {
      if (toolName === 'prep_focus_app_first') {
        return makeApprovalRequiredResult()
      }

      return makeSuccessResult('main action done')
    })

    const initial = await executeWorkflow({
      workflow: wf,
      executeAction,
      stateManager: sm,
    })

    expect(initial.status).toBe('paused')
    expect(initial.suspension).toBeDefined()
    expect(initial.suspension!.pausedDuring).toBe('action_prep')
    expect(executeAction).toHaveBeenCalledTimes(1)

    sm.updateForegroundContext({
      available: true,
      appName: 'Cursor',
      platform: 'darwin',
    })

    const resumed = await resumeWorkflow({
      suspension: initial.suspension!,
      executeAction: vi.fn().mockResolvedValue(makeSuccessResult('main action done')),
      stateManager: sm,
      approved: true,
    })

    expect(resumed.success).toBe(true)
    expect(resumed.status).toBe('completed')
    expect(resumed.stepResults).toHaveLength(1)
    expect(resumed.stepResults[0]!.status).toBe('success')
  })

  it('fails the workflow when focus action-prep fails and does not execute the main action', async () => {
    const wf: WorkflowDefinition = {
      id: 'test_focus_prep_failure',
      name: 'Focus Prep Failure Test',
      description: 'Focus prep failure should block the main action.',
      maxRetries: 3,
      steps: [
        { label: 'Click in Cursor', kind: 'click_element', description: 'Click button', params: { x: 100, y: 100 } },
      ],
    }

    const sm = new RunStateManager()
    sm.updateForegroundContext({
      available: true,
      appName: 'Google Chrome',
      platform: 'darwin',
    })
    sm.updateDisplayInfo({
      available: true,
      platform: 'darwin',
      logicalWidth: 1728,
      logicalHeight: 1117,
    })

    const executeAction: ExecuteAction = vi.fn().mockImplementation(async (_, toolName) => {
      if (toolName === 'prep_focus_app_first') {
        return makeErrorResult('focus failed')
      }

      return makeSuccessResult('main action done')
    })

    const result = await executeWorkflow({
      workflow: wf,
      executeAction,
      stateManager: sm,
    })

    expect(result.status).toBe('failed')
    expect(result.success).toBe(false)
    expect(result.stepResults[0]!.explanation).toContain('Preparatory action "focus_app" failed')
    expect(executeAction).toHaveBeenCalledTimes(1)
  })

  it('fails the workflow when screenshot action-prep fails and does not execute tool-prep or the main action', async () => {
    const wf: WorkflowDefinition = {
      id: 'test_screenshot_prep_failure',
      name: 'Screenshot Prep Failure Test',
      description: 'Screenshot prep failure should block the step.',
      maxRetries: 3,
      steps: [
        { label: 'Click in remote session', kind: 'click_element', description: 'Click button', params: { x: 100, y: 100 } },
      ],
    }

    const sm = new RunStateManager()
    sm.updateForegroundContext({
      available: true,
      appName: 'Terminal',
      platform: 'darwin',
    })
    sm.updateExecutionTarget({
      mode: 'remote',
      transport: 'ssh-stdio',
      hostName: 'remote-test',
      isolated: false,
      tainted: true,
    })

    const executeAction: ExecuteAction = vi.fn().mockImplementation(async (_, toolName) => {
      if (toolName === 'prep_take_screenshot_first') {
        return makeErrorResult('screenshot failed')
      }

      return makeSuccessResult('main action done')
    })
    const executePrepTool = vi.fn().mockResolvedValue(makePrepSuccessResult({ status: 'ok' }))

    const result = await executeWorkflow({
      workflow: wf,
      executeAction,
      executePrepTool,
      stateManager: sm,
    })

    expect(result.status).toBe('failed')
    expect(executeAction).toHaveBeenCalledTimes(1)
    expect(executePrepTool).not.toHaveBeenCalled()
  })

  it('runs action-prep before tool-prep when both are needed', async () => {
    const wf: WorkflowDefinition = {
      id: 'test_action_then_tool_prep',
      name: 'Action Then Tool Prep Test',
      description: 'Action prep should happen before tool prep.',
      maxRetries: 3,
      steps: [
        { label: 'Click in Cursor', kind: 'click_element', description: 'Click button', params: { x: 100, y: 100 } },
      ],
    }

    const sm = new RunStateManager()
    sm.updateForegroundContext({
      available: true,
      appName: 'Google Chrome',
      platform: 'darwin',
    })
    sm.updateExecutionTarget({
      mode: 'remote',
      transport: 'ssh-stdio',
      hostName: 'remote-test',
      isolated: false,
      tainted: true,
    })

    const callSequence: string[] = []

    const executeAction: ExecuteAction = vi.fn().mockImplementation(async (_, toolName) => {
      callSequence.push(toolName)
      if (toolName === 'prep_focus_app_first') {
        sm.updateForegroundContext({
          available: true,
          appName: 'Cursor',
          platform: 'darwin',
        })
      }
      return makeSuccessResult(toolName)
    })
    const executePrepTool = vi.fn().mockImplementation(async (toolName) => {
      callSequence.push(toolName)
      return makePrepSuccessResult({
        status: 'ok',
        displayCount: 1,
        displays: [
          {
            displayId: 1,
            isMain: true,
            isBuiltIn: true,
            bounds: { x: 0, y: 0, width: 1728, height: 1117 },
            visibleBounds: { x: 0, y: 25, width: 1728, height: 1078 },
            scaleFactor: 2,
            pixelWidth: 3456,
            pixelHeight: 2234,
          },
        ],
        combinedBounds: { x: 0, y: 0, width: 1728, height: 1117 },
        capturedAt: '2026-03-11T15:00:00.000Z',
      })
    })

    const result = await executeWorkflow({
      workflow: wf,
      executeAction,
      executePrepTool,
      stateManager: sm,
    })

    expect(result.success).toBe(true)
    expect(callSequence[0]).toBe('prep_focus_app_first')
    expect(callSequence[1]).toBe('prep_take_screenshot_first')
    const firstToolPrepIndex = callSequence.indexOf('display_enumerate')
    const lastActionPrepIndex = callSequence.lastIndexOf('prep_take_screenshot_first')
    expect(firstToolPrepIndex).toBeGreaterThan(lastActionPrepIndex)
  })

  it('runs display enumerate prep and continues to main action when no reroute', async () => {
    const wf: WorkflowDefinition = {
      id: 'test_prep_display',
      name: 'Prep Display Test',
      description: 'Screenshot without displayInfo triggers prep.',
      maxRetries: 3,
      steps: [
        { label: 'Take screenshot', kind: 'take_screenshot', description: 'Capture', params: {} },
      ],
    }

    const executeAction: ExecuteAction = vi.fn().mockResolvedValue(makeSuccessResult())
    const executePrepTool = vi.fn().mockResolvedValue(makePrepSuccessResult({
      status: 'ok',
      displayCount: 2,
      displays: [
        {
          displayId: 1,
          isMain: true,
          isBuiltIn: true,
          bounds: { x: 0, y: 0, width: 1728, height: 1117 },
          visibleBounds: { x: 0, y: 25, width: 1728, height: 1078 },
          scaleFactor: 2,
          pixelWidth: 3456,
          pixelHeight: 2234,
        },
        {
          displayId: 2,
          isMain: false,
          isBuiltIn: false,
          bounds: { x: 1728, y: 0, width: 1920, height: 1080 },
          visibleBounds: { x: 1728, y: 0, width: 1920, height: 1040 },
          scaleFactor: 1,
          pixelWidth: 1920,
          pixelHeight: 1080,
        },
      ],
      combinedBounds: { x: 0, y: 0, width: 3648, height: 1117 },
      capturedAt: '2026-03-11T14:00:00.000Z',
    }))
    const sm = new RunStateManager()

    const result = await executeWorkflow({
      workflow: wf,
      executeAction,
      executePrepTool,
      stateManager: sm,
    })

    expect(result.success).toBe(true)
    expect(result.status).toBe('completed')
    expect(executePrepTool).toHaveBeenCalledWith('display_enumerate', { skipApprovalQueue: false })
    expect(executeAction).toHaveBeenCalledTimes(1)
    expect(result.stepResults[0]!.preparatoryResults).toEqual([
      expect.objectContaining({
        toolName: 'display_enumerate',
        succeeded: true,
        metadata: expect.objectContaining({
          displayCount: 2,
          combinedBounds: { x: 0, y: 0, width: 3648, height: 1117 },
        }),
      }),
    ])

    const displayInfo = sm.getState().displayInfo
    expect(displayInfo).toMatchObject({
      available: true,
      logicalWidth: 3648,
      logicalHeight: 1117,
      displayCount: 2,
      combinedBounds: { x: 0, y: 0, width: 3648, height: 1117 },
    })
    expect(displayInfo?.displays).toHaveLength(2)
  })

  it('fails the workflow when a preparatory tool fails', async () => {
    const wf: WorkflowDefinition = {
      id: 'test_failed_prep',
      name: 'Failed Prep Test',
      description: 'Display prep failure should block the main action.',
      maxRetries: 3,
      steps: [
        { label: 'Take screenshot', kind: 'take_screenshot', description: 'Capture', params: {} },
      ],
    }

    const executeAction: ExecuteAction = vi.fn().mockResolvedValue(makeSuccessResult())
    const executePrepTool = vi.fn().mockResolvedValue(makeErrorResult('display enumeration unavailable'))
    const sm = new RunStateManager()

    const result = await executeWorkflow({
      workflow: wf,
      executeAction,
      executePrepTool,
      stateManager: sm,
    })

    expect(result.success).toBe(false)
    expect(result.status).toBe('failed')
    expect(result.task.phase).toBe('failed')
    expect(result.stepResults[0]!.status).toBe('failure')
    expect(result.stepResults[0]!.explanation).toContain('Preparatory tool "display_enumerate" failed')
    expect(result.stepResults[0]!.preparatoryResults).toEqual([
      expect.objectContaining({
        toolName: 'display_enumerate',
        succeeded: false,
        error: 'display enumeration unavailable',
      }),
    ])
    expect(executePrepTool).toHaveBeenCalledTimes(2)
    expect(executeAction).not.toHaveBeenCalled()
  })

  it('retries transient preparatory tools once before continuing', async () => {
    const wf: WorkflowDefinition = {
      id: 'test_retry_prep',
      name: 'Retry Prep Test',
      description: 'Display prep retries once.',
      maxRetries: 3,
      steps: [
        { label: 'Take screenshot', kind: 'take_screenshot', description: 'Capture', params: {} },
      ],
    }

    const executeAction: ExecuteAction = vi.fn().mockResolvedValue(makeSuccessResult())
    const executePrepTool = vi.fn()
      .mockResolvedValueOnce(makeErrorResult('temporary display probe failure'))
      .mockResolvedValueOnce(makePrepSuccessResult({
        status: 'ok',
        displayCount: 1,
        displays: [
          {
            displayId: 1,
            isMain: true,
            isBuiltIn: true,
            bounds: { x: 0, y: 0, width: 1728, height: 1117 },
            visibleBounds: { x: 0, y: 25, width: 1728, height: 1078 },
            scaleFactor: 2,
            pixelWidth: 3456,
            pixelHeight: 2234,
          },
        ],
        combinedBounds: { x: 0, y: 0, width: 1728, height: 1117 },
        capturedAt: '2026-03-11T14:05:00.000Z',
      }))
    const sm = new RunStateManager()

    const result = await executeWorkflow({
      workflow: wf,
      executeAction,
      executePrepTool,
      stateManager: sm,
    })

    expect(result.success).toBe(true)
    expect(result.status).toBe('completed')
    expect(executePrepTool).toHaveBeenCalledTimes(2)
    expect(executeAction).toHaveBeenCalledTimes(1)
  })
})
