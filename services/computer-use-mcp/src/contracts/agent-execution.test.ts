import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import { describe, expect, it } from 'vitest'

import { attachAgentExecutionContracts, buildAgentExecutionContracts, createModelDecision } from './agent-execution'

const action = { kind: 'click', input: { x: 10, y: 20 } } as const

describe('agent execution contracts', () => {
  it('keeps a pending authorization separate from execution', () => {
    const decision = createModelDecision('computer_act', action)
    const contracts = buildAgentExecutionContracts({
      result: {
        content: [],
        structuredContent: {
          status: 'approval_required',
          pendingActionId: 'pending-1',
          policy: { requiresApproval: true },
        },
      },
      modelDecision: decision,
    })

    expect(contracts.modelDecision.kind).toBe('model_decision')
    expect(contracts.authorization).toMatchObject({ kind: 'authorization', status: 'pending', pendingActionId: 'pending-1' })
    expect(contracts.execution).toMatchObject({ kind: 'execution', status: 'not_started', dispatch: 'not_started' })
    expect(contracts.businessVerification.status).toBe('not_run')
  })

  it('marks accepted input as unverified business state', () => {
    const decision = createModelDecision('computer_act', action)
    const contracts = buildAgentExecutionContracts({
      result: {
        content: [],
        structuredContent: {
          status: 'executed',
          backendResult: { performed: true },
          policy: { requiresApproval: false },
        },
      },
      modelDecision: decision,
    })

    expect(contracts.authorization.status).toBe('not_required')
    expect(contracts.execution).toMatchObject({ status: 'delivered', dispatch: 'accepted', doNotReplay: false })
    expect(contracts.businessVerification).toMatchObject({ status: 'not_run' })
  })

  it('blocks blind replay after a failure with an unknown dispatch state', () => {
    const decision = createModelDecision('computer_act', action)
    const contracts = buildAgentExecutionContracts({
      result: { content: [], isError: true, structuredContent: { status: 'failed', policy: { requiresApproval: false } } },
      modelDecision: decision,
    })

    expect(contracts.execution).toMatchObject({ status: 'unknown', dispatch: 'unknown', doNotReplay: true })
  })

  it('adds separate fields without replacing the legacy status', () => {
    const decision = createModelDecision('computer_act', action)
    const result: CallToolResult = { content: [], structuredContent: { status: 'executed' } }
    const output = attachAgentExecutionContracts(result, buildAgentExecutionContracts({ result, modelDecision: decision }))
    expect(output.structuredContent).toMatchObject({ status: 'executed', modelDecision: decision, execution: { kind: 'execution' } })
  })
})
