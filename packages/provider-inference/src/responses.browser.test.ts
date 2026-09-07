import type { GenerationProvider } from './types'

import { responses } from '@xsai-ext/responses'
import { describe, expect, it } from 'vitest'

import { ProviderValidationCheck } from './types'
import { createOpenAICompatibleValidators } from './validators/openai-compatible'

function stream(events: unknown[]) {
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

async function settle(events: unknown[]) {
  const result = responses({
    baseURL: 'https://provider.test/v1/',
    model: 'test',
    input: 'hello',
    fetch: async () => stream(events),
  })
  // Each public promise must settle, including when the transport fails.
  const results = await Promise.allSettled([result.steps, result.input, result.usage, result.totalUsage])
  return results
}

describe('xsAI Responses terminal lifecycle', () => {
  // ROOT CAUSE:
  // xsAI 0.5.0 resolves its result promises at EOF without requiring a terminal
  // event, and maps response.failed to an ordinary step. The pnpm patch makes
  // both paths fail so AIRI cannot persist an interrupted turn as successful.
  it('rejects an SSE stream that ends before a terminal event', async () => {
    const results = await settle([{ type: 'response.output_text.delta', delta: 'partial' }])
    expect(results.map(result => result.status)).toEqual(['rejected', 'rejected', 'rejected', 'rejected'])
  })

  it('rejects a provider failure delivered inside a successful HTTP response', async () => {
    const results = await settle([{
      type: 'response.failed',
      response: { output: [], error: { message: 'Provider failed' } },
    }])
    expect(results.map(result => result.status)).toEqual(['rejected', 'rejected', 'rejected', 'rejected'])
  })

  it('awaits asynchronous event consumers before finalizing', async () => {
    let consumed = false
    const result = responses({
      baseURL: 'https://provider.test/v1/',
      model: 'test',
      input: 'hello',
      fetch: async () => stream([
        { type: 'response.output_text.delta', delta: 'hello' },
        { type: 'response.completed', response: { output: [], usage: null } },
      ]),
      onEvent: async (event) => {
        if (event.type === 'text.delta') {
          await new Promise(resolve => setTimeout(resolve, 10))
          consumed = true
        }
      },
    })
    await Promise.all([result.steps, result.input, result.usage, result.totalUsage])
    expect(consumed).toBe(true)
  })
})

// ROOT CAUSE:
// OpenAI emits response.reasoning_text.delta, while xsAI 0.5.0 only maps
// response.reasoning.delta. The patch accepts both event names.
// https://platform.openai.com/docs/api-reference/responses-streaming
it('maps OpenAI reasoning_text deltas to the shared reasoning event', async () => {
  const events: string[] = []
  const result = responses({
    baseURL: 'https://provider.test/v1/',
    model: 'test',
    input: 'hello',
    fetch: async () => stream([
      { type: 'response.reasoning_text.delta', delta: 'thinking' },
      { type: 'response.completed', response: { output: [], usage: null } },
    ]),
    onEvent: (event) => {
      if (event.type === 'reasoning.delta')
        events.push(event.delta)
    },
  })
  await Promise.all([result.steps, result.input, result.usage, result.totalUsage])
  expect(events).toEqual(['thinking'])
})

it('validates Responses through its own endpoint and rejects HTTP 400', async () => {
  const context = { t: (key: string) => key }
  const validators = createOpenAICompatibleValidators({ checks: [ProviderValidationCheck.ChatCompletions] })
  const validator = await validators!.validateProvider![0](context)
  let rejectRequest = false
  const provider: GenerationProvider = {
    responses: model => ({
      model,
      baseURL: 'https://provider.test/v1/',
      fetch: async (url) => {
        expect(String(url)).toBe('https://provider.test/v1/responses')
        return rejectRequest
          ? new Response('Unsupported API', { status: 400 })
          : stream([{ type: 'response.completed', response: { output: [], usage: null } }])
      },
    }),
  }
  const extra = { listModels: async () => [{ id: 'test', name: 'Test', provider: 'test' }] }
  expect((await validator.validator({}, provider, extra, context)).valid).toBe(true)
  rejectRequest = true
  expect((await validator.validator({}, provider, extra, context)).valid).toBe(false)
})
