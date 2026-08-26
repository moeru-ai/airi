import type { ComputerUseConfig } from './types'

import { describe, expect, it } from 'vitest'

import { evaluateActionPolicy } from './policy'
import { createTestConfig } from './test-fixtures'

const baseConfig: ComputerUseConfig = createTestConfig({
  denyApps: ['airi'],
  executor: 'dry-run',
  permissionChainHint: 'Terminal -> local dry-run',
  requireAllowedBoundsForMutatingActions: false,
  requireCoordinateAlignmentForMutatingActions: false,
  requireSessionTagForMutatingActions: false,
})

describe('evaluateActionPolicy', () => {
  it('requires approval for mutating ui actions in actions mode', () => {
    const decision = evaluateActionPolicy({
      action: {
        input: {
          x: 10,
          y: 12,
        },
        kind: 'click',
      },
      config: baseConfig,
      context: {
        appName: 'Finder',
        available: true,
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
        input: {
          command: 'pwd',
        },
        kind: 'terminal_exec',
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
        input: {
          command: 'pwd',
        },
        kind: 'terminal_exec',
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

  it('treats secret env reads as high-risk but non-mutating', () => {
    const decision = evaluateActionPolicy({
      action: {
        input: {
          filePath: '/workspace/airi/.env',
          keys: ['DISCORD_BOT_TOKEN'],
        },
        kind: 'secret_read_env_value',
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

  it('denies sensitive foreground apps for ui actions', () => {
    const decision = evaluateActionPolicy({
      action: {
        input: {
          keys: ['command', 'l'],
        },
        kind: 'press_keys',
      },
      config: baseConfig,
      context: {
        appName: 'AIRI',
        available: true,
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
        input: {
          app: 'Safari',
        },
        kind: 'open_app',
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

  it('allows app aliases when the canonical app is configured', () => {
    const decision = evaluateActionPolicy({
      action: {
        input: {
          app: 'VS Code',
        },
        kind: 'open_app',
      },
      config: baseConfig,
      context: {
        available: false,
        platform: 'darwin',
      },
      operationsExecuted: 0,
      operationUnitsConsumed: 0,
    })

    expect(decision.allowed).toBe(true)
  })

  it('denies app actions on the legacy linux-x11 executor', () => {
    const decision = evaluateActionPolicy({
      action: {
        input: {
          app: 'Terminal',
        },
        kind: 'focus_app',
      },
      config: {
        ...baseConfig,
        executor: 'linux-x11',
      },
      context: {
        available: false,
        platform: 'linux',
      },
      operationsExecuted: 0,
      operationUnitsConsumed: 0,
    })

    expect(decision.allowed).toBe(false)
    expect(decision.reasons[0]).toContain('linux-x11 executor does not support app open/focus actions')
  })
})
