import type { AssistantTurn } from '../messages/types'

import { expect, it, vi } from 'vitest'

import { streamFrom } from './llm-service'

// https://github.com/moeru-ai/airi/pull/2477
it('records real Chat SDK rounds and keeps failed tool results on their invocation', async () => {
  const requests: { messages: unknown[] }[] = []
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)))
    const chunk = requests.length === 1
      ? { choices: [{ index: 0, delta: { tool_calls: [
          { index: 0, id: 'failed', type: 'function', function: { name: 'lookup', arguments: '{}' } },
          { index: 1, id: 'ok', type: 'function', function: { name: 'backup', arguments: '{}' } },
        ] }, finish_reason: 'tool_calls' }] }
      : { choices: [{ index: 0, delta: { content: 'Used the backup.' }, finish_reason: 'stop' }] }
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
  }
  const failure = vi.fn(() => {
    throw new Error('Lookup failed')
  })
  const backup = vi.fn(() => 'Backup result')
  let transcript: AssistantTurn | undefined
  await streamFrom({
    model: 'test',
    chatProvider: { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://example.test/v1/', fetch } }) },
    conversation: { turns: [] },
    options: {
      tools: [
        { type: 'function', function: { name: 'lookup', parameters: { type: 'object', properties: {} } }, execute: failure },
        { type: 'function', function: { name: 'backup', parameters: { type: 'object', properties: {} } }, execute: backup },
      ],
      onTranscript: (turn) => { transcript = turn },
    },
  })
  expect(requests).toHaveLength(2)
  expect(transcript?.rounds.map(round => round.toolInvocations.length)).toEqual([2, 0])
  expect(transcript?.rounds[0].toolInvocations[0].execution.status).toBe('failed')
  expect(transcript?.rounds[0].toolInvocations[1].execution).toEqual({ status: 'succeeded', output: [{ type: 'text', text: 'Backup result' }] })
  expect(transcript?.rounds[1].content).toEqual([{ type: 'text', text: 'Used the backup.' }])
  expect(transcript?.rounds[0].continuation?.data).toHaveLength(3)
  expect(failure).toHaveBeenCalledTimes(1)
  expect(backup).toHaveBeenCalledTimes(1)
})
