import type { Conversation } from './types'

import { describe, expect, it } from 'vitest'

import { createEmptyContextCompaction } from './compaction-contract'
import { ConversationCompact } from './conversation-compact'

function requestConversation(): Conversation {
  return {
    turns: [
      { type: 'user', id: 'goal', content: [{ type: 'text', text: 'Keep the action state.' }] },
      { type: 'assistant', id: 'run-1', status: 'completed', rounds: [{
        id: 'round-1',
        content: [{ type: 'text', text: 'Observed state. '.repeat(500) }, { type: 'tool', invocationId: 'tool-1' }],
        modelDecisions: [{ id: 'tool-1', callId: 'call-1', name: 'computer_act', arguments: '{}', decidedAt: '2026-11-17T00:00:00.000Z' }],
        toolInvocations: [{ id: 'tool-1', callId: 'call-1', name: 'computer_act', arguments: '{}', execution: { status: 'succeeded', output: [{ type: 'text', text: 'delivered' }] } }],
        projectionIssues: [],
      }] },
      { type: 'assistant', id: 'run-2', status: 'completed', rounds: [{
        id: 'round-2',
        content: [{ type: 'text', text: 'Latest state. '.repeat(500) }],
        toolInvocations: [],
        projectionIssues: [],
      }] },
    ],
  }
}

describe('context compaction contract', () => {
  it('preserves the other four contracts without importing their state', () => {
    const contract = createEmptyContextCompaction()
    expect(contract).toMatchObject({
      kind: 'context_compaction',
      status: 'not_compacted',
      preserves: {
        modelDecision: true,
        authorization: true,
        execution: true,
        businessVerification: true,
      },
    })
    expect(contract).not.toHaveProperty('authorizationStatus')
    expect(contract).not.toHaveProperty('executionStatus')
  })

  it('records compression separately and retains tool call identity', async () => {
    const compact = new ConversationCompact({ softLimitBytes: 1_000, retainRounds: 1 })
    compact.setMode('synchronous')
    const source = requestConversation()
    const measure = (value: Conversation) => new TextEncoder().encode(JSON.stringify(value)).byteLength
    const projected = await compact.prepare(source, {
      scope: 'fixture/model',
      measureContextBytes: measure,
      summarize: async () => 'Earlier state summary.',
    })

    const contract = compact.getCompactionContract()
    expect(contract.status).toBe('applied')
    expect(contract.summarizedRoundIds).toEqual(['round-1'])
    expect(contract.retainedModelDecisionIds).toEqual(['tool-1'])
    expect(contract.retainedToolCallIds).toEqual(['call-1'])
    expect(contract.preserves).toEqual({ modelDecision: true, authorization: true, execution: true, businessVerification: true })
    const summary = projected.turns.find(turn => turn.type === 'system')
    expect(summary).toMatchObject({ content: [{ metadata: { contextCompaction: { kind: 'context_compaction', status: 'applied' } } }] })
    const retained = projected.turns.flatMap(turn => turn.type === 'assistant' ? turn.rounds.flatMap(round => round.toolInvocations) : [])
    expect(retained).toHaveLength(1)
    expect(retained[0].callId).toBe('call-1')
  })
})
