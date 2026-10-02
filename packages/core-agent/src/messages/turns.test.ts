import type { Conversation, UserTurn } from './types'

import { expect, expectTypeOf, it } from 'vitest'

import { chatMessagesToTurns, conversationToChatMessages } from './chat-completions'

it('keeps application context below trusted system and developer instructions', () => {
  const conversation: Conversation = { turns: [
    { type: 'system', id: 'policy', authority: 'system', content: [{ type: 'text', text: 'Application policy' }] },
    { type: 'system', id: 'hint', authority: 'developer', content: [{ type: 'text', text: 'Application hint' }] },
    { type: 'system', id: 'external', authority: 'context', content: [{ type: 'text', text: 'External event data' }] },
    { type: 'user', id: 'input', content: [{ type: 'text', text: 'Hello' }] },
  ] }
  const snapshot = structuredClone(conversation)
  expect(conversationToChatMessages(conversation)).toEqual([
    { role: 'system', content: 'Application policy' },
    { role: 'developer', content: 'Application hint' },
    { role: 'user', content: 'External event data' },
    { role: 'user', content: 'Hello' },
  ])
  expect(conversation).toEqual(snapshot)
  expectTypeOf<UserTurn>().not.toHaveProperty('rounds')
})

// https://github.com/moeru-ai/airi/pull/2477
it('scopes imported rounds and tool invocations by the stored turn identity', () => {
  const history = [
    { role: 'assistant' as const, content: '', tool_calls: [{ type: 'function' as const, id: 'call', function: { name: 'lookup', arguments: '{}' } }] },
    { role: 'tool' as const, tool_call_id: 'call', content: 'result' },
  ]
  const [first] = chatMessagesToTurns(history, 'stored-first')
  const [second] = chatMessagesToTurns(history, 'stored-second')
  if (first.type !== 'assistant' || second.type !== 'assistant')
    throw new Error('Expected assistant turns')
  expect(first.rounds[0].id).not.toBe(second.rounds[0].id)
  expect(first.rounds[0].toolInvocations[0].id).not.toBe(second.rounds[0].toolInvocations[0].id)
  expect(first.rounds[0].modelCall).toBeUndefined()
  expect(first.runId).toBeUndefined()
})
