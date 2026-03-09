import type { ComputerUseConfig } from './types'

import { describe, expect, it } from 'vitest'

import { evaluateActionPolicy } from './policy'
import { createTestConfig } from './test-fixtures'

const baseConfig: ComputerUseConfig = createTestConfig({
  executor: 'dry-run',
  permissionChainHint: 'Terminal -> local dry-run',
  denyApps: ['airi'],
  requireAllowedBoundsForMutatingActions: false,
  requireCoordinateAlignmentForMutatingActions: false,
  requireSessionTagForMutatingActions: false,
})

describe('evaluateActionPolicy', () => {
  it('requires approval for mutating ui actions in actions mode', () => {
    const decision = evaluateActionPolicy({
      action: {
        kind: 'click',
        input: {
          x: 10,
          y: 12,
        },
      },
      config: baseConfig,
      context: {
        available: true,
        appName: 'Finder',
        platform: 'darwin',
      },
      operationsExecuted: 0,
      operationUnitsConsumed: 0,
    })

    expect(decision.allowed).toBe(true)
    expect(decision.requiresApproval).toBe(true)
  })

  it('requires approval for terminal execution in actions mode', () => {
    const decision = evaluateActionPolicy({
      action: {
        kind: 'terminal_exec',
        input: {
          command: 'pwd',
        },
      },
      config: {
        ...baseConfig,
        approvalMode: 'actions',
      },
      context: {
        available: false,
        platform: 'darwin',
      },
      operationsExecuted: 0,
      operationUnitsConsumed: 0,
    })

    expect(decision.allowed).toBe(true)
    expect(decision.requiresApproval).toBe(true)
    expect(decision.riskLevel).toBe('high')
  })

  it('skips approval for terminal execution in never mode', () => {
    const decision = evaluateActionPolicy({
      action: {
        kind: 'terminal_exec',
        input: {
          command: 'pwd',
        },
      },
      config: {
        ...baseConfig,
        approvalMode: 'never',
      },
      context: {
        available: false,
        platform: 'darwin',
      },
      operationsExecuted: 0,
      operationUnitsConsumed: 0,
    })

    expect(decision.allowed).toBe(true)
    expect(decision.requiresApproval).toBe(false)
    expect(decision.riskLevel).toBe('high')
  })

  it('denies sensitive foreground apps for ui actions', () => {
    const decision = evaluateActionPolicy({
      action: {
        kind: 'press_keys',
        input: {
          keys: ['command', 'l'],
        },
      },
      config: baseConfig,
      context: {
        available: true,
        appName: 'AIRI',
        platform: 'darwin',
      },
      operationsExecuted: 0,
      operationUnitsConsumed: 0,
    })

    expect(decision.allowed).toBe(false)
    expect(decision.reasons[0]).toContain('foreground app denied')
  })

  it('denies opening apps outside the configured openable list', () => {
    const decision = evaluateActionPolicy({
      action: {
        kind: 'open_app',
        input: {
          app: 'Safari',
        },
      },
      config: baseConfig,
      context: {
        available: false,
        platform: 'darwin',
      },
      operationsExecuted: 0,
      operationUnitsConsumed: 0,
    })

    expect(decision.allowed).toBe(false)
    expect(decision.reasons[0]).toContain('COMPUTER_USE_OPENABLE_APPS')
  })
})
