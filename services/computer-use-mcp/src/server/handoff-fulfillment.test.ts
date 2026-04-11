import type { CrossLaneHandoffContract } from '../lane-handoff-contract'
import type { VerificationEvidenceRecord } from '../verification-evidence'

import { describe, expect, it } from 'vitest'

import { evaluateHandoffFulfillment } from './handoff-fulfillment'

describe('evaluateHandoffFulfillment', () => {
  const mockContract: CrossLaneHandoffContract = {
    id: 'handoff-1',
    sourceLane: 'coding',
    targetLane: 'browser',
    reason: 'validate_visual_state',
    constraints: [
      { description: 'Check app name is Finder', required: true },
      { description: 'Optional check', required: false },
    ],
    approvalScope: 'none',
    status: 'active',
    initiatedAt: new Date().toISOString(),
  }

  it('marks as fulfilled when all required constraints match evidence', () => {
    const records: VerificationEvidenceRecord[] = [
      {
        kind: 'foreground_context',
        source: 'test',
        capturedAt: new Date().toISOString(),
        confidence: 1.0,
        summary: 'App is Finder',
        blockingEligible: false,
        observed: { appName: 'Finder' },
      },
    ]

    const result = evaluateHandoffFulfillment(mockContract, records)
    expect(result.status).toBe('fulfilled')
    expect(result.fulfilledCount).toBe(2) // 1 matched + 1 optional
    expect(result.evidence[0]).toBe('App is Finder')
  })

  it('marks as failed when a required constraint is missing', () => {
    const records: VerificationEvidenceRecord[] = [
      {
        kind: 'terminal_result',
        source: 'test',
        capturedAt: new Date().toISOString(),
        confidence: 1.0,
        summary: 'Some other evidence',
        blockingEligible: false,
      },
    ]

    const result = evaluateHandoffFulfillment(mockContract, records)
    expect(result.status).toBe('partial')
    expect(result.fulfilledCount).toBe(1) // only optional one
    expect(result.failureReason).toContain('1 required constraints')
    expect(result.repairHint).toBe('refocus_target_app')
  })

  it('uses expectedValue for matching if provided', () => {
    const contractWithExpected: CrossLaneHandoffContract = {
      ...mockContract,
      constraints: [
        { description: 'Check title', required: true, expectedValue: 'Dashboard' },
      ],
    }

    const records: VerificationEvidenceRecord[] = [
      {
        kind: 'foreground_context',
        source: 'test',
        capturedAt: new Date().toISOString(),
        confidence: 1.0,
        summary: 'Captured window',
        blockingEligible: false,
        observed: { windowTitle: 'Dashboard' },
      },
    ]

    const result = evaluateHandoffFulfillment(contractWithExpected, records)
    expect(result.status).toBe('fulfilled')
  })
})
