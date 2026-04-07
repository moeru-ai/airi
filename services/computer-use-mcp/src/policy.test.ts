import type { ActionInvocation, ComputerUseConfig } from './types'

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
  it('treats desktop mutation actions as approval-required in actions mode', () => {
    const actions: ActionInvocation[] = [
      { kind: 'click', input: { x: 10, y: 12 } },
      { kind: 'type_text', input: { text: 'hello' } },
      { kind: 'press_keys', input: { keys: ['command', 'l'] } },
      { kind: 'scroll', input: { deltaY: 120 } },
    ]

    for (const action of actions) {
      const decision = evaluateActionPolicy({
        action,
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
    }
  })

  it('keeps observe/read actions non-mutating in actions mode', () => {
    const actions: ActionInvocation[] = [
      { kind: 'screenshot', input: {} },
      { kind: 'observe_windows', input: {} },
      { kind: 'coding_read_file', input: { filePath: '/tmp/mock.ts' } },
      { kind: 'coding_search_text', input: { query: 'needle' } },
    ]

    for (const action of actions) {
      const decision = evaluateActionPolicy({
        action,
        config: {
          ...baseConfig,
          approvalMode: 'actions',
        },
        context: {
          available: true,
          appName: 'Finder',
          platform: 'darwin',
        },
        operationsExecuted: 0,
        operationUnitsConsumed: 0,
      })

      expect(decision.allowed).toBe(true)
      expect(decision.requiresApproval).toBe(false)
    }
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

  it('treats secret env reads as high-risk but non-mutating', () => {
    const decision = evaluateActionPolicy({
      action: {
        kind: 'secret_read_env_value',
        input: {
          filePath: '/Users/liuziheng/airi/.env',
          keys: ['DISCORD_BOT_TOKEN'],
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

  it('allows app aliases when the canonical app is configured', () => {
    const decision = evaluateActionPolicy({
      action: {
        kind: 'open_app',
        input: {
          app: 'VS Code',
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

    expect(decision.allowed).toBe(true)
  })

  it('denies app actions on the legacy linux-x11 executor', () => {
    const decision = evaluateActionPolicy({
      action: {
        kind: 'focus_app',
        input: {
          app: 'Terminal',
        },
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

  it('keeps coding_apply_patch baseline risk at high', () => {
    const decision = evaluateActionPolicy({
      action: {
        kind: 'coding_apply_patch',
        input: {
          filePath: '/tmp/mock.ts',
          oldString: 'before',
          newString: 'after',
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
})
