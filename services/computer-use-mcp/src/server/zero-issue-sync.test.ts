import type { ComputerUseServerRuntime } from './runtime'

import { beforeEach, describe, expect, it } from 'vitest'

import { CodingPrimitives } from '../coding/primitives'
import { RunStateManager } from '../state'

describe('zero-Issue Sync (reportStatus lock)', () => {
  let runtime: ComputerUseServerRuntime

  beforeEach(() => {
    runtime = {
      stateManager: new RunStateManager(),
    } as unknown as ComputerUseServerRuntime
  })

  it('throws McpError when trying to report completed with unresolved issues', async () => {
    const primitives = new CodingPrimitives(runtime)

    // Simulate a review with hallucinated unresolved issues
    runtime.stateManager.updateCodingState({
      lastChangeReview: {
        status: 'needs_follow_up',
        recommendedNextAction: 'amend',
        unresolvedIssues: ['Hallucinated issue: Variable might be undefined in edge case'],
        filesReviewed: ['src/index.ts'],
        detectedRisks: [],
        diffSummary: 'fake diff',
        validationSummary: 'fake validation',
        validationCommand: 'pnpm test',
        baselineComparison: 'unknown',
        recommendedNextAction: 'Address hallucinated issues',
      },
    })

    // Attempt to bypass by reporting 'completed'
    await expect(
      primitives.reportStatus('completed', 'I am done', [], [], [], 'none'),
    ).rejects.toThrowError(/Permission Locked \(Zero-Issue Sync\)/)

    await expect(
      primitives.reportStatus('completed', 'I am done', [], [], [], 'none'),
    ).rejects.toThrowError(/Hallucinated issue: Variable might be undefined in edge case/)
  })

  it('allows reporting in_progress even with unresolved issues', async () => {
    const primitives = new CodingPrimitives(runtime)

    runtime.stateManager.updateCodingState({
      lastChangeReview: {
        status: 'needs_follow_up',
        recommendedNextAction: 'amend',
        unresolvedIssues: ['Real issue: Syntax error on line 42'],
        filesReviewed: ['src/index.ts'],
        detectedRisks: [],
        diffSummary: 'fake diff',
        validationSummary: 'fake validation',
        validationCommand: 'pnpm test',
        baselineComparison: 'unknown',
        recommendedNextAction: 'Fix syntax error',
      },
    })

    // Reporting in_progress should not throw
    const result = await primitives.reportStatus('in_progress', 'Working on it', [], [], [], 'Fixing syntax error')
    expect(result.status).toBe('in_progress')
  })

  it('allows reporting completed if there are no unresolved issues', async () => {
    const primitives = new CodingPrimitives(runtime)

    runtime.stateManager.updateCodingState({
      lastChangeReview: {
        status: 'ready_for_next_file',
        recommendedNextAction: 'continue',
        unresolvedIssues: [], // Empty!
        filesReviewed: ['src/index.ts'],
        detectedRisks: [],
        diffSummary: 'fake diff',
        validationSummary: 'fake validation',
        validationCommand: 'pnpm test',
        baselineComparison: 'unknown',
        recommendedNextAction: 'Proceed to next file',
      },
    })

    // Reporting completed should succeed
    const result = await primitives.reportStatus('completed', 'All good', [], [], [], 'done')
    expect(result.status).toBe('completed')
  })
})
