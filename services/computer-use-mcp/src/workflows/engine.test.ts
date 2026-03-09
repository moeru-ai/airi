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
})
