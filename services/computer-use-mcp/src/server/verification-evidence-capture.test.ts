import type { ComputerUseServerRuntime } from './runtime'

import { describe, expect, it } from 'vitest'

import { RunStateManager } from '../state'
import { captureHandoffEvidence } from './verification-evidence-capture'

function createRuntime() {
  return {
    stateManager: new RunStateManager(),
  } as unknown as ComputerUseServerRuntime
}

describe('captureHandoffEvidence', () => {
  it('includes the current return observation when evaluating fulfillment', () => {
    const runtime = createRuntime()
    const handoffId = 'handoff_return_1'

    runtime.stateManager.updateRunState({
      activeHandoffContract: {
        id: handoffId,
        sourceLane: 'coding',
        targetLane: 'browser',
        reason: 'validate_visual_state',
        constraints: [{
          description: 'dashboard marker must exist',
          required: true,
          expectedValue: 'Dashboard',
        }],
        approvalScope: 'none',
        status: 'active',
        initiatedAt: new Date().toISOString(),
      },
    })

    captureHandoffEvidence(runtime, {
      source: 'workflow_switch_lane',
      handoffId,
      sourceLane: 'browser',
      targetLane: 'coding',
      reason: 'return_evidence',
      summary: 'Returned browser evidence',
      observation: {
        windowTitle: 'Dashboard',
      },
    })

    const state = runtime.stateManager.getState()
    expect(state.activeHandoffContract).toBeUndefined()
    expect(state.handoffHistory).toHaveLength(1)
    expect(state.handoffHistory[0]?.status).toBe('fulfilled')
    expect(state.handoffHistory[0]?.evidence?.[0]).toContain('Returned browser evidence')
  })

  it('evaluates against deterministic prior+current evidence set on return', () => {
    const runtime = createRuntime()
    const handoffId = 'handoff_return_2'

    runtime.stateManager.updateRunState({
      activeHandoffContract: {
        id: handoffId,
        sourceLane: 'coding',
        targetLane: 'browser',
        reason: 'validate_visual_state',
        constraints: [
          {
            description: 'finder marker must exist',
            required: true,
            expectedValue: 'Finder',
          },
          {
            description: 'dashboard marker must exist',
            required: true,
            expectedValue: 'Dashboard',
          },
        ],
        approvalScope: 'none',
        status: 'active',
        initiatedAt: new Date().toISOString(),
      },
      lastVerificationEvidence: [{
        kind: 'runtime_fact_summary',
        source: 'prior',
        capturedAt: new Date().toISOString(),
        confidence: 1,
        summary: 'Finder marker present',
        blockingEligible: false,
        observed: {
          marker: 'Finder',
        },
      }],
    })

    captureHandoffEvidence(runtime, {
      source: 'workflow_switch_lane',
      handoffId,
      sourceLane: 'browser',
      targetLane: 'coding',
      reason: 'return_evidence',
      summary: 'Returned browser evidence',
      observation: {
        windowTitle: 'Dashboard',
      },
    })

    const state = runtime.stateManager.getState()
    expect(state.handoffHistory).toHaveLength(1)
    expect(state.handoffHistory[0]?.status).toBe('fulfilled')
    expect(state.handoffHistory[0]?.evidence?.[0]).toContain('Finder marker present')
    expect(state.handoffHistory[0]?.evidence?.[1]).toContain('Returned browser evidence')
  })
})
