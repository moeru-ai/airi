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

function makeApprovalRequiredResult(): CallToolResult {
  return {
    content: [{ text: 'Approval required for this action.', type: 'text' }],
    structuredContent: { status: 'approval_required' } as unknown as CallToolResult['structuredContent'],
  }
}

function makeErrorResult(text = 'something went wrong'): CallToolResult {
  return {
    content: [{ text, type: 'text' }],
    isError: true,
  }
}

function makePrepSuccessResult(structuredContent: Record<string, unknown>): CallToolResult {
  return {
    content: [{ text: 'prep ok', type: 'text' }],
    structuredContent: structuredContent as CallToolResult['structuredContent'],
  }
}

function makeSuccessResult(text = 'ok'): CallToolResult {
  return { content: [{ text, type: 'text' }] }
}

function makeThreeStepWorkflowWithApproval(): WorkflowDefinition {
  return {
    description: 'Three steps; second returns approval_required.',
    id: 'test_approval',
    maxRetries: 3,
    name: 'Approval Test',
    steps: [
      { description: 'Run step 1', kind: 'run_command', label: 'Step 1', params: { command: 'echo a' } },
      { description: 'Run step 2', kind: 'run_command', label: 'Step 2 (needs approval)', params: { command: 'echo b' } },
      { description: 'Run step 3', kind: 'run_command', label: 'Step 3', params: { command: 'echo c' } },
    ],
  }
}

function makeTwoStepWorkflow(): WorkflowDefinition {
  return {
    description: 'A simple two-step workflow for testing.',
    id: 'test_two_step',
    maxRetries: 3,
    name: 'Two Step Test',
    steps: [
      { description: 'Run step 1', kind: 'run_command', label: 'Step 1', params: { command: 'echo step1' } },
      { description: 'Run step 2', kind: 'run_command', label: 'Step 2', params: { command: 'echo step2' } },
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
      executeAction,
      stateManager: sm,
      workflow: makeTwoStepWorkflow(),
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
      executeAction,
      stateManager: sm,
      workflow: wf,
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
      executeAction,
      stateManager: sm,
      workflow: wf,
    })
    expect(initial.suspension).toBeDefined()

    // Resume with approval
    const resumed = await resumeWorkflow({
      approved: true,
      executeAction,
      stateManager: sm,
      suspension: initial.suspension!,
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
      executeAction,
      stateManager: sm,
      workflow: wf,
    })
    expect(initial.suspension).toBeDefined()

    const resumed = await resumeWorkflow({
      approved: false,
      executeAction,
      stateManager: sm,
      suspension: initial.suspension!,
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
      description: 'A critical step fails.',
      id: 'test_critical',
      maxRetries: 3,
      name: 'Critical Failure Test',
      steps: [
        { description: 'Run step 1', kind: 'run_command', label: 'Step 1', params: { command: 'echo a' } },
        { critical: true, description: 'Critical step', kind: 'run_command', label: 'Step 2 (critical)', params: { command: 'bad' } },
        { description: 'Should not run', kind: 'run_command', label: 'Step 3', params: { command: 'echo c' } },
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
      executeAction,
      stateManager: sm,
      workflow: wf,
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
      description: 'Two approval steps; second should be auto-approved on resume.',
      id: 'test_auto_approve',
      maxRetries: 3,
      name: 'Auto Approve Test',
      steps: [
        { description: 'Step 1', kind: 'run_command', label: 'Step 1', params: { command: 'echo a' } },
        { description: 'Needs approval', kind: 'run_command', label: 'Step 2 (approval)', params: { command: 'echo b' } },
        { description: 'Step 3', kind: 'run_command', label: 'Step 3', params: { command: 'echo c' } },
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
      executeAction,
      stateManager: sm,
      workflow: wf,
    })

    // Resume with autoApproveSteps
    const resumed = await resumeWorkflow({
      approved: true,
      autoApproveSteps: true,
      executeAction,
      stateManager: sm,
      suspension: initial.suspension!,
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
      executeAction,
      stateManager: sm,
      workflow: makeTwoStepWorkflow(),
    })

    expect(result.status).toBe('completed')
    expect(result.stepResults[0]!.status).toBe('success')
    expect(result.stepResults[1]!.status).toBe('success')
  })

  it('returns failed status on step failure', async () => {
    const wf: WorkflowDefinition = {
      description: 'A critical step fails.',
      id: 'test_fail_status',
      maxRetries: 3,
      name: 'Fail Status Test',
      steps: [
        { critical: true, description: 'Critical fail', kind: 'run_command', label: 'Step 1 (critical)', params: { command: 'bad' } },
      ],
    }

    const executeAction: ExecuteAction = vi.fn().mockResolvedValue(makeErrorResult('boom'))
    const sm = new RunStateManager()

    const result = await executeWorkflow({
      executeAction,
      stateManager: sm,
      workflow: wf,
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
      executeAction,
      stateManager: sm,
      workflow: wf,
    })

    expect(result.status).toBe('paused')
    expect(result.stepResults[1]!.status).toBe('pending_approval')
  })

  // -----------------------------------------------------------------------
  // failureCount double-counting fix
  // -----------------------------------------------------------------------

  it('does not double-count failures (completeCurrentStep already increments)', async () => {
    const wf: WorkflowDefinition = {
      description: 'Two steps, first fails.',
      id: 'test_failure_count',
      maxRetries: 5,
      name: 'Failure Count Test',
      steps: [
        { description: 'Fails', kind: 'run_command', label: 'Step 1', params: { command: 'bad' } },
        { description: 'Succeeds', kind: 'run_command', label: 'Step 2', params: { command: 'echo ok' } },
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
      executeAction,
      stateManager: sm,
      workflow: wf,
    })

    // failureCount should be 1 (not 2 from double-counting)
    expect(result.task.failureCount).toBe(1)
  })

  // -----------------------------------------------------------------------
  // Prep pipeline + reroute tests
  // -----------------------------------------------------------------------

  it('triggers reroute when strategy advises browser surface for browser foreground', async () => {
    const wf: WorkflowDefinition = {
      description: 'Click in browser triggers reroute.',
      id: 'test_reroute',
      maxRetries: 3,
      name: 'Reroute Test',
      steps: [
        { description: 'Click button', kind: 'click_element', label: 'Click in browser', params: { x: 100, y: 100 } },
      ],
    }

    const executeAction: ExecuteAction = vi.fn().mockResolvedValue(makeSuccessResult())
    const executePrepTool = vi.fn().mockResolvedValue(makePrepSuccessResult({
      elementCount: 4,
      page: { title: 'Example', url: 'https://example.com' },
      status: 'ok',
    }))
    const sm = new RunStateManager()
    // Set browser foreground context so strategy emits use_browser_surface (reroute)
    sm.updateForegroundContext({
      appName: 'Google Chrome',
      available: true,
      platform: 'darwin',
    })
    sm.updateBrowserSurfaceAvailability({
      availableSurfaces: ['browser_dom'],
      cdp: {
        connectable: true,
        connected: true,
        endpoint: 'http://localhost:9222',
      },
      executionMode: 'local-windowed',
      extension: {
        connected: true,
        enabled: true,
      },
      preferredSurface: 'browser_dom',
      reason: 'Browser extension bridge is already connected.',
      selectedToolName: 'browser_dom_read_page',
      suitable: true,
    })
    sm.updateDisplayInfo({
      available: true,
      logicalHeight: 1117,
      logicalWidth: 1728,
      platform: 'darwin',
    })

    const result = await executeWorkflow({
      executeAction,
      executePrepTool,
      stateManager: sm,
      workflow: wf,
    })

    expect(result.status).toBe('reroute_required')
    expect(result.success).toBe(false)
    expect(result.rerouteAdvisory).toBeDefined()
    expect(result.rerouteAdvisory!.kind).toBe('use_browser_surface')
    expect(result.rerouteAdvisory!.recommendedSurface).toBe('browser_dom')
    expect(result.stepResults[0]!.status).toBe('reroute_required')
    expect(result.stepResults[0]!.preparatoryResults).toEqual([
      expect.objectContaining({
        metadata: expect.objectContaining({
          frameCount: undefined,
        }),
        succeeded: true,
        toolName: 'browser_dom_read_page',
      }),
    ])
    expect(executePrepTool).toHaveBeenCalledWith('browser_dom_read_page', { skipApprovalQueue: false })
    expect(executeAction).not.toHaveBeenCalled()
  })

  it('runs action-prep before browser reroute evaluation and avoids stale reroute after focusing', async () => {
    const wf: WorkflowDefinition = {
      description: 'Focus target app before deciding on browser reroute.',
      id: 'test_action_prep_before_reroute',
      maxRetries: 3,
      name: 'Action Prep Before Reroute Test',
      steps: [
        { description: 'Click button', kind: 'click_element', label: 'Click in Cursor', params: { x: 100, y: 100 } },
      ],
    }

    const sm = new RunStateManager()
    sm.updateForegroundContext({
      appName: 'Google Chrome',
      available: true,
      platform: 'darwin',
    })
    sm.updateDisplayInfo({
      available: true,
      logicalHeight: 1117,
      logicalWidth: 1728,
      platform: 'darwin',
    })
    sm.updateBrowserSurfaceAvailability({
      availableSurfaces: ['browser_dom'],
      cdp: {
        connectable: true,
        connected: true,
        endpoint: 'http://localhost:9222',
      },
      executionMode: 'local-windowed',
      extension: {
        connected: true,
        enabled: true,
      },
      preferredSurface: 'browser_dom',
      reason: 'Browser extension bridge is already connected.',
      selectedToolName: 'browser_dom_read_page',
      suitable: true,
    })

    const executeAction: ExecuteAction = vi.fn().mockImplementation(async (action, toolName) => {
      if (toolName === 'prep_focus_app_first') {
        sm.updateForegroundContext({
          appName: 'Cursor',
          available: true,
          platform: 'darwin',
        })
        return makeSuccessResult('focused')
      }

      return makeSuccessResult(`executed ${action.kind}`)
    })
    const executePrepTool = vi.fn().mockResolvedValue(makePrepSuccessResult({ status: 'ok' }))

    const result = await executeWorkflow({
      executeAction,
      executePrepTool,
      stateManager: sm,
      workflow: wf,
    })

    expect(result.success).toBe(true)
    expect(result.status).toBe('completed')
    expect(executeAction).toHaveBeenCalledTimes(2)
    expect(executeAction).toHaveBeenNthCalledWith(
      1,
      { input: { app: 'Cursor' }, kind: 'focus_app' },
      'prep_focus_app_first',
      { skipApprovalQueue: false },
    )
    expect(executePrepTool).not.toHaveBeenCalled()
  })

  it('pauses the workflow when action-prep requires approval and resumes the same step later', async () => {
    const wf: WorkflowDefinition = {
      description: 'Focus requires approval before main action.',
      id: 'test_action_prep_approval',
      maxRetries: 3,
      name: 'Action Prep Approval Test',
      steps: [
        { description: 'Click button', kind: 'click_element', label: 'Click in Cursor', params: { x: 100, y: 100 } },
      ],
    }

    const sm = new RunStateManager()
    sm.updateForegroundContext({
      appName: 'Google Chrome',
      available: true,
      platform: 'darwin',
    })
    sm.updateDisplayInfo({
      available: true,
      logicalHeight: 1117,
      logicalWidth: 1728,
      platform: 'darwin',
    })

    const executeAction: ExecuteAction = vi.fn().mockImplementation(async (_, toolName) => {
      if (toolName === 'prep_focus_app_first') {
        return makeApprovalRequiredResult()
      }

      return makeSuccessResult('main action done')
    })

    const initial = await executeWorkflow({
      executeAction,
      stateManager: sm,
      workflow: wf,
    })

    expect(initial.status).toBe('paused')
    expect(initial.suspension).toBeDefined()
    expect(initial.suspension!.pausedDuring).toBe('action_prep')
    expect(executeAction).toHaveBeenCalledTimes(1)

    sm.updateForegroundContext({
      appName: 'Cursor',
      available: true,
      platform: 'darwin',
    })

    const resumed = await resumeWorkflow({
      approved: true,
      executeAction: vi.fn().mockResolvedValue(makeSuccessResult('main action done')),
      stateManager: sm,
      suspension: initial.suspension!,
    })

    expect(resumed.success).toBe(true)
    expect(resumed.status).toBe('completed')
    expect(resumed.stepResults).toHaveLength(1)
    expect(resumed.stepResults[0]!.status).toBe('success')
  })

  it('fails the workflow when focus action-prep fails and does not execute the main action', async () => {
    const wf: WorkflowDefinition = {
      description: 'Focus prep failure should block the main action.',
      id: 'test_focus_prep_failure',
      maxRetries: 3,
      name: 'Focus Prep Failure Test',
      steps: [
        { description: 'Click button', kind: 'click_element', label: 'Click in Cursor', params: { x: 100, y: 100 } },
      ],
    }

    const sm = new RunStateManager()
    sm.updateForegroundContext({
      appName: 'Google Chrome',
      available: true,
      platform: 'darwin',
    })
    sm.updateDisplayInfo({
      available: true,
      logicalHeight: 1117,
      logicalWidth: 1728,
      platform: 'darwin',
    })

    const executeAction: ExecuteAction = vi.fn().mockImplementation(async (_, toolName) => {
      if (toolName === 'prep_focus_app_first') {
        return makeErrorResult('focus failed')
      }

      return makeSuccessResult('main action done')
    })

    const result = await executeWorkflow({
      executeAction,
      stateManager: sm,
      workflow: wf,
    })

    expect(result.status).toBe('failed')
    expect(result.success).toBe(false)
    expect(result.stepResults[0]!.explanation).toContain('Preparatory action "focus_app" failed')
    expect(executeAction).toHaveBeenCalledTimes(1)
  })

  it('fails the workflow when screenshot action-prep fails and does not execute tool-prep or the main action', async () => {
    const wf: WorkflowDefinition = {
      description: 'Screenshot prep failure should block the step.',
      id: 'test_screenshot_prep_failure',
      maxRetries: 3,
      name: 'Screenshot Prep Failure Test',
      steps: [
        { description: 'Click button', kind: 'click_element', label: 'Click in remote session', params: { x: 100, y: 100 } },
      ],
    }

    const sm = new RunStateManager()
    sm.updateForegroundContext({
      appName: 'Terminal',
      available: true,
      platform: 'darwin',
    })
    sm.updateExecutionTarget({
      hostName: 'remote-test',
      isolated: false,
      mode: 'remote',
      tainted: true,
      transport: 'ssh-stdio',
    })

    const executeAction: ExecuteAction = vi.fn().mockImplementation(async (_, toolName) => {
      if (toolName === 'prep_take_screenshot_first') {
        return makeErrorResult('screenshot failed')
      }

      return makeSuccessResult('main action done')
    })
    const executePrepTool = vi.fn().mockResolvedValue(makePrepSuccessResult({ status: 'ok' }))

    const result = await executeWorkflow({
      executeAction,
      executePrepTool,
      stateManager: sm,
      workflow: wf,
    })

    expect(result.status).toBe('failed')
    expect(executeAction).toHaveBeenCalledTimes(1)
    expect(executePrepTool).not.toHaveBeenCalled()
  })

  it('runs action-prep before tool-prep when both are needed', async () => {
    const wf: WorkflowDefinition = {
      description: 'Action prep should happen before tool prep.',
      id: 'test_action_then_tool_prep',
      maxRetries: 3,
      name: 'Action Then Tool Prep Test',
      steps: [
        { description: 'Click button', kind: 'click_element', label: 'Click in Cursor', params: { x: 100, y: 100 } },
      ],
    }

    const sm = new RunStateManager()
    sm.updateForegroundContext({
      appName: 'Google Chrome',
      available: true,
      platform: 'darwin',
    })
    sm.updateExecutionTarget({
      hostName: 'remote-test',
      isolated: false,
      mode: 'remote',
      tainted: true,
      transport: 'ssh-stdio',
    })

    const callSequence: string[] = []

    const executeAction: ExecuteAction = vi.fn().mockImplementation(async (_, toolName) => {
      callSequence.push(toolName)
      if (toolName === 'prep_focus_app_first') {
        sm.updateForegroundContext({
          appName: 'Cursor',
          available: true,
          platform: 'darwin',
        })
      }
      return makeSuccessResult(toolName)
    })
    const executePrepTool = vi.fn().mockImplementation(async (toolName) => {
      callSequence.push(toolName)
      return makePrepSuccessResult({
        capturedAt: '2026-03-11T15:00:00.000Z',
        combinedBounds: { height: 1117, width: 1728, x: 0, y: 0 },
        displayCount: 1,
        displays: [
          {
            bounds: { height: 1117, width: 1728, x: 0, y: 0 },
            displayId: 1,
            isBuiltIn: true,
            isMain: true,
            pixelHeight: 2234,
            pixelWidth: 3456,
            scaleFactor: 2,
            visibleBounds: { height: 1078, width: 1728, x: 0, y: 25 },
          },
        ],
        status: 'ok',
      })
    })

    const result = await executeWorkflow({
      executeAction,
      executePrepTool,
      stateManager: sm,
      workflow: wf,
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
      description: 'Screenshot without displayInfo triggers prep.',
      id: 'test_prep_display',
      maxRetries: 3,
      name: 'Prep Display Test',
      steps: [
        { description: 'Capture', kind: 'take_screenshot', label: 'Take screenshot', params: {} },
      ],
    }

    const executeAction: ExecuteAction = vi.fn().mockResolvedValue(makeSuccessResult())
    const executePrepTool = vi.fn().mockResolvedValue(makePrepSuccessResult({
      capturedAt: '2026-03-11T14:00:00.000Z',
      combinedBounds: { height: 1117, width: 3648, x: 0, y: 0 },
      displayCount: 2,
      displays: [
        {
          bounds: { height: 1117, width: 1728, x: 0, y: 0 },
          displayId: 1,
          isBuiltIn: true,
          isMain: true,
          pixelHeight: 2234,
          pixelWidth: 3456,
          scaleFactor: 2,
          visibleBounds: { height: 1078, width: 1728, x: 0, y: 25 },
        },
        {
          bounds: { height: 1080, width: 1920, x: 1728, y: 0 },
          displayId: 2,
          isBuiltIn: false,
          isMain: false,
          pixelHeight: 1080,
          pixelWidth: 1920,
          scaleFactor: 1,
          visibleBounds: { height: 1040, width: 1920, x: 1728, y: 0 },
        },
      ],
      status: 'ok',
    }))
    const sm = new RunStateManager()

    const result = await executeWorkflow({
      executeAction,
      executePrepTool,
      stateManager: sm,
      workflow: wf,
    })

    expect(result.success).toBe(true)
    expect(result.status).toBe('completed')
    expect(executePrepTool).toHaveBeenCalledWith('display_enumerate', { skipApprovalQueue: false })
    expect(executeAction).toHaveBeenCalledTimes(1)
    expect(result.stepResults[0]!.preparatoryResults).toEqual([
      expect.objectContaining({
        metadata: expect.objectContaining({
          combinedBounds: { height: 1117, width: 3648, x: 0, y: 0 },
          displayCount: 2,
        }),
        succeeded: true,
        toolName: 'display_enumerate',
      }),
    ])

    const displayInfo = sm.getState().displayInfo
    expect(displayInfo).toMatchObject({
      available: true,
      combinedBounds: { height: 1117, width: 3648, x: 0, y: 0 },
      displayCount: 2,
      logicalHeight: 1117,
      logicalWidth: 3648,
    })
    expect(displayInfo?.displays).toHaveLength(2)
  })

  it('fails the workflow when a preparatory tool fails', async () => {
    const wf: WorkflowDefinition = {
      description: 'Display prep failure should block the main action.',
      id: 'test_failed_prep',
      maxRetries: 3,
      name: 'Failed Prep Test',
      steps: [
        { description: 'Capture', kind: 'take_screenshot', label: 'Take screenshot', params: {} },
      ],
    }

    const executeAction: ExecuteAction = vi.fn().mockResolvedValue(makeSuccessResult())
    const executePrepTool = vi.fn().mockResolvedValue(makeErrorResult('display enumeration unavailable'))
    const sm = new RunStateManager()

    const result = await executeWorkflow({
      executeAction,
      executePrepTool,
      stateManager: sm,
      workflow: wf,
    })

    expect(result.success).toBe(false)
    expect(result.status).toBe('failed')
    expect(result.task.phase).toBe('failed')
    expect(result.stepResults[0]!.status).toBe('failure')
    expect(result.stepResults[0]!.explanation).toContain('Preparatory tool "display_enumerate" failed')
    expect(result.stepResults[0]!.preparatoryResults).toEqual([
      expect.objectContaining({
        error: 'display enumeration unavailable',
        succeeded: false,
        toolName: 'display_enumerate',
      }),
    ])
    expect(executePrepTool).toHaveBeenCalledTimes(2)
    expect(executeAction).not.toHaveBeenCalled()
  })

  it('retries transient preparatory tools once before continuing', async () => {
    const wf: WorkflowDefinition = {
      description: 'Display prep retries once.',
      id: 'test_retry_prep',
      maxRetries: 3,
      name: 'Retry Prep Test',
      steps: [
        { description: 'Capture', kind: 'take_screenshot', label: 'Take screenshot', params: {} },
      ],
    }

    const executeAction: ExecuteAction = vi.fn().mockResolvedValue(makeSuccessResult())
    const executePrepTool = vi.fn()
      .mockResolvedValueOnce(makeErrorResult('temporary display probe failure'))
      .mockResolvedValueOnce(makePrepSuccessResult({
        capturedAt: '2026-03-11T14:05:00.000Z',
        combinedBounds: { height: 1117, width: 1728, x: 0, y: 0 },
        displayCount: 1,
        displays: [
          {
            bounds: { height: 1117, width: 1728, x: 0, y: 0 },
            displayId: 1,
            isBuiltIn: true,
            isMain: true,
            pixelHeight: 2234,
            pixelWidth: 3456,
            scaleFactor: 2,
            visibleBounds: { height: 1078, width: 1728, x: 0, y: 25 },
          },
        ],
        status: 'ok',
      }))
    const sm = new RunStateManager()

    const result = await executeWorkflow({
      executeAction,
      executePrepTool,
      stateManager: sm,
      workflow: wf,
    })

    expect(result.success).toBe(true)
    expect(result.status).toBe('completed')
    expect(executePrepTool).toHaveBeenCalledTimes(2)
    expect(executeAction).toHaveBeenCalledTimes(1)
  })
})
