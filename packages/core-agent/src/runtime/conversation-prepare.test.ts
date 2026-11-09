import type { GenerationProvider } from '@proj-airi/provider-inference'
import type { Tool } from '@xsai/shared-chat'

import type { AssistantTurn, Conversation } from '../messages/types'

import { describe, expect, it, vi } from 'vitest'

import { ConversationCompact } from '../messages/conversation-compact'
import { streamFrom } from './llm-service'

describe.each(['chat-completions', 'responses'] as const)('%s request context', (protocol) => {
  it.each([true, false, undefined])('gates a large tool image with explicit vision support %s', async (supportsVisionInput) => {
    const requests: Record<string, unknown>[] = []
    const budgets: { textBytes: number, imageBytes: number, totalBytes: number }[] = []
    const image = `data:image/png;base64,${'A'.repeat(768 * 1024)}`
    let dispatches = 0
    let effects = 0
    const fetch: typeof globalThis.fetch = async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)))
      const callsTool = requests.length === 1
      const output = callsTool
        ? [{ type: 'function_call', call_id: 'observe-1', name: 'fixture', arguments: '{}' }]
        : [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Observation received.' }] }]
      const events = protocol === 'responses'
        ? [...output.map(item => ({ type: 'response.output_item.done', item })), { type: 'response.completed', response: { output } }]
        : [{ choices: [{ index: 0, delta: callsTool
            ? { tool_calls: [{ index: 0, id: 'observe-1', type: 'function', function: { name: 'fixture', arguments: '{}' } }] }
            : { content: 'Observation received.' }, finish_reason: callsTool ? 'tool_calls' : 'stop' }] }]
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
    }
    const chatProvider: GenerationProvider = { generation: model => protocol === 'responses'
      ? { protocol, webSearch: false, config: { model, baseURL: 'https://example.com/v1/', fetch } }
      : { protocol, config: { model, baseURL: 'https://example.com/v1/', fetch } } }
    const compact = new ConversationCompact({ softLimitBytes: 256 * 1024, hardLimitBytes: 512 * 1024, retainRounds: 1 })
    const summarize = vi.fn(async () => 'Never requested in Off mode')
    const pending = streamFrom({ model: 'test', chatProvider, conversation: { turns: [{
      type: 'user',
      id: 'goal',
      content: [{ type: 'text', text: 'Observe the isolated fixture.' }],
    }] }, options: {
      supportsVisionInput,
      contextWindowTokens: 64_000,
      maxTokens: 2_000,
      tools: [{ type: 'function', function: { name: 'fixture', parameters: { type: 'object', properties: {} } }, execute: () => {
        dispatches++
        effects++
        return [{ type: 'text', text: 'Fixture observation receipt.' }, { type: 'image_url', image_url: { url: image } }]
      } }],
      prepareConversation: (context, target) => {
        budgets.push(target.measureContextBudget!(context))
        expect(target.contextBudgetLimits?.outputReserveTokens).toBe(2_000)
        return compact.prepare(context, { ...target, summarize })
      },
    } })
    if (supportsVisionInput)
      await pending
    else
      await expect(pending).rejects.toThrow('context exceeds')

    expect(requests).toHaveLength(supportsVisionInput ? 2 : 1)
    expect(dispatches).toBe(1)
    expect(effects).toBe(1)
    expect(summarize).not.toHaveBeenCalled()
    expect(budgets[1].totalBytes).toBeGreaterThan(512 * 1024)
    expect(budgets[1].textBytes).toBeLessThan(59_000)
    expect(budgets[1].imageBytes).toBe(image.length)
    if (supportsVisionInput)
      expect(JSON.stringify(requests[1])).toContain(image)
    console.info(JSON.stringify({ boundary: 'Real Core adapters, synthetic image, controlled provider and executor', protocol, supportsVisionInput, requests: requests.length, dispatches, effects, budgets }))
  })

  it.each(['unknown-model', 'small-model'])('refreshes metadata when switching to %s without replaying a tool', async (nextModel) => {
    let requests = 0
    let effects = 0
    const targets: { model: string, supportsVisionInput?: boolean, hardLimitBytes?: number }[] = []
    const fetch: typeof globalThis.fetch = async () => {
      requests++
      const item = { type: 'function_call', call_id: 'once', name: 'fixture', arguments: '{}' }
      const events = protocol === 'responses'
        ? [{ type: 'response.output_item.done', item }, { type: 'response.completed', response: { output: [item] } }]
        : [{ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'once', type: 'function', function: { name: 'fixture', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] }]
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
    }
    const chatProvider: GenerationProvider = { generation: model => protocol === 'responses'
      ? { protocol, webSearch: false, config: { model, baseURL: 'https://example.com/v1/', fetch } }
      : { protocol, config: { model, baseURL: 'https://example.com/v1/', fetch } } }
    const tools: Tool[] = [{ type: 'function', function: { name: 'fixture', parameters: { type: 'object', properties: {} } }, execute: () => {
      effects++
      return [{ type: 'text', text: 'Fixture receipt. '.repeat(500) }, { type: 'image_url', image_url: { url: `data:image/png;base64,${'A'.repeat(768 * 1024)}` } }]
    } }]
    const compact = new ConversationCompact({ softLimitBytes: 256 * 1024, hardLimitBytes: 512 * 1024, retainRounds: 1 })
    await expect(streamFrom({ model: 'vision-model', chatProvider, conversation: { turns: [{
      type: 'user',
      id: 'goal',
      content: [{ type: 'text', text: 'Observe once.' }],
    }] }, options: {
      contextWindowTokens: 1_000_000,
      supportsVisionInput: true,
      resolveStep: async () => ({
        model: requests ? nextModel : 'vision-model',
        chatProvider,
        providerId: 'fixture-provider',
        systemPrompt: '',
        tools,
        supportsVisionInput: requests && nextModel === 'unknown-model' ? undefined : true,
        contextWindowTokens: requests ? nextModel === 'unknown-model' ? undefined : 8_000 : 64_000,
        maxTokens: 2_000,
      }),
      prepareConversation: (context, target) => {
        targets.push({ model: target.model, supportsVisionInput: target.supportsVisionInput, hardLimitBytes: target.contextBudgetLimits?.hardLimitBytes })
        return compact.prepare(context, { ...target, summarize: async () => 'Never requested' })
      },
    } })).rejects.toThrow('context exceeds')
    expect(requests).toBe(1)
    expect(effects).toBe(1)
    expect(targets).toEqual([
      { model: 'vision-model', supportsVisionInput: true, hardLimitBytes: 58_800 },
      { model: nextModel, supportsVisionInput: nextModel !== 'unknown-model', hardLimitBytes: nextModel === 'unknown-model' ? undefined : 5_600 },
    ])
    console.info(JSON.stringify({ boundary: 'Real model-switch path, controlled provider and executor', protocol, requests, effects, targets }))
  })

  it.each(['summary', 'failure', 'cancel'] as const)('gates the actual next provider request on a %s barrier', async (mode) => {
    const requests: Record<string, unknown>[] = []
    let dispatches = 0
    let effects = 0
    let release: (value: string) => void = () => {}
    const gate = new Promise<string>((resolve) => {
      release = resolve
    })
    let started: () => void = () => {}
    const summaryStarted = new Promise<void>((resolve) => {
      started = resolve
    })
    const compact = new ConversationCompact({ softLimitBytes: 6000, hardLimitBytes: 14000, retainRounds: 1 })
    compact.setMode('background')
    const controller = new AbortController()
    const fetch: typeof globalThis.fetch = async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)))
      const index = requests.length
      const output = index < 3
        ? [{ type: 'function_call', call_id: `call-${index}`, name: 'fixture', arguments: '{}' }]
        : [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Finished.' }] }]
      const events = protocol === 'responses'
        ? [...output.map(item => ({ type: 'response.output_item.done', item })), { type: 'response.completed', response: { output } }]
        : [{ choices: [{ index: 0, delta: index < 3 ? { tool_calls: [{ index: 0, id: `call-${index}`, type: 'function', function: { name: 'fixture', arguments: '{}' } }] } : { content: 'Finished.' }, finish_reason: index < 3 ? 'tool_calls' : 'stop' }] }]
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
    }
    const chatProvider: GenerationProvider = { generation: model => protocol === 'responses'
      ? { protocol, webSearch: false, config: { model, baseURL: 'https://example.com/v1/', fetch } }
      : { protocol, config: { model, baseURL: 'https://example.com/v1/', fetch } } }
    const receipt = '{"status":"unknown","noNewDispatch":false,"exitCode":null}'
    const source: Conversation = { turns: [{ type: 'user', id: 'goal', content: [{ type: 'text', text: 'Original goal.' }] }, { type: 'user', id: 'notice', notice: { source: 'host' }, content: [{ type: 'text', text: `Exact Host Notice: ${receipt}` }] }] }
    const original = structuredClone(source)
    let result: AssistantTurn | undefined
    const pending = streamFrom({ model: 'test', chatProvider, conversation: source, options: {
      abortSignal: controller.signal,
      tools: [{ type: 'function', function: { name: 'fixture', parameters: { type: 'object', properties: {} } }, execute: () => {
        dispatches++
        effects++
        return [{ type: 'text', text: receipt }, { type: 'image_url', image_url: { url: `data:image/png;base64,${'A'.repeat(8000)}` } }]
      } }],
      prepareConversation: (context, target) => compact.prepare(context, { ...target, summarize: async () => {
        started()
        const text = await gate
        if (mode === 'failure')
          throw new Error('Summary provider failed')
        return text
      } }, controller.signal),
      onGeneratedTurn: (turn) => { result = turn },
    } })
    const settlement = Promise.allSettled([pending])
    await summaryStarted
    expect(requests).toHaveLength(2)
    expect(dispatches).toBe(2)
    expect(effects).toBe(2)
    if (mode === 'cancel')
      controller.abort(new Error('User cancelled'))
    release('Earlier visual observation.')
    const [settled] = await settlement
    console.info(JSON.stringify({ boundary: 'Real Core adapters and SDK. Controlled provider and executor.', protocol, mode, dispatches, effects, settlement: settled.status, requests, generatedTurn: result }))
    expect(settled.status).toBe(mode === 'summary' ? 'fulfilled' : 'rejected')
    expect(requests).toHaveLength(mode === 'summary' ? 3 : 2)
    expect(dispatches).toBe(2)
    expect(effects).toBe(2)
    expect(source).toEqual(original)
    if (mode === 'summary') {
      expect(JSON.stringify(requests[2])).toContain('Earlier visual observation.')
      expect(JSON.stringify(requests[2])).toContain('Original goal.')
      expect(JSON.stringify(requests[2])).toContain('Exact Host Notice:')
      expect(JSON.stringify(requests[2])).toContain('noNewDispatch\\":false')
      expect(result?.rounds.map(round => round.toolInvocations[0]?.callId)).toEqual(['call-1', 'call-2', undefined])
      expect(result?.rounds[0].toolInvocations[0].execution).toMatchObject({ status: 'succeeded', output: [{ type: 'text', text: receipt }, { type: 'image' }] })
    }
    compact.reset()
  })

  it('does not replay a completed tool after the provider rejects the next context', async () => {
    const requests: Record<string, unknown>[] = []
    let effects = 0
    const fetch: typeof globalThis.fetch = async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)))
      if (requests.length > 1)
        return new Response(JSON.stringify({ error: { message: 'context length exceeded' } }), { status: 413, headers: { 'content-type': 'application/json' } })

      const output = [{ type: 'function_call', call_id: 'call-1', name: 'fixture', arguments: '{}' }]
      const events = protocol === 'responses'
        ? [...output.map(item => ({ type: 'response.output_item.done', item })), { type: 'response.completed', response: { output } }]
        : [{ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'fixture', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] }]
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
    }
    const chatProvider: GenerationProvider = { generation: model => protocol === 'responses'
      ? { protocol, webSearch: false, config: { model, baseURL: 'https://example.com/v1/', fetch } }
      : { protocol, config: { model, baseURL: 'https://example.com/v1/', fetch } } }

    await expect(streamFrom({
      model: 'test',
      chatProvider,
      conversation: { turns: [{ type: 'user', id: 'goal', content: [{ type: 'text', text: 'Complete once.' }] }] },
      options: {
        tools: [{ type: 'function', function: { name: 'fixture', parameters: { type: 'object', properties: {} } }, execute: () => {
          effects++
          return 'external effect receipt'
        } }],
      },
    })).rejects.toThrow('context length exceeded')

    expect(requests).toHaveLength(2)
    expect(effects).toBe(1)
  })

  it('projects each request without losing rounds when the request history shrinks', async () => {
    const requests: Record<string, unknown>[] = []
    let effects = 0
    const execute = vi.fn(() => `effect-${++effects}`)
    const fetch: typeof globalThis.fetch = async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)))
      const index = requests.length
      const callsTool = index < 4
      const output = callsTool
        ? [{ type: 'function_call', call_id: `call-${index}`, name: 'fixture', arguments: '{}' }]
        : [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Finished.' }] }]
      const events = protocol === 'responses'
        ? [...output.map(item => ({ type: 'response.output_item.done', item })), { type: 'response.completed', response: { output } }]
        : [{ choices: [{ index: 0, delta: callsTool
            ? { tool_calls: [{ index: 0, id: `call-${index}`, type: 'function', function: { name: 'fixture', arguments: '{}' } }] }
            : { content: 'Finished.' }, finish_reason: callsTool ? 'tool_calls' : 'stop' }] }]
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
    }
    const chatProvider: GenerationProvider = { generation: model => protocol === 'responses'
      ? { protocol, webSearch: false, config: { model, baseURL: 'https://example.com/v1/', fetch } }
      : { protocol, config: { model, baseURL: 'https://example.com/v1/', fetch } } }
    const source: Conversation = { turns: [{ type: 'user', id: 'owner', content: [{ type: 'text', text: 'Complete the fixture once.' }] }] }
    const snapshots: Conversation[] = []
    let result: AssistantTurn | undefined
    await streamFrom({
      model: 'test',
      chatProvider,
      conversation: source,
      options: {
        requestCorrelation: { conversationId: 'session', turnId: 'run' },
        tools: [{ type: 'function', function: { name: 'fixture', parameters: { type: 'object', properties: {} } }, execute }],
        prepareConversation: async (conversation) => {
          snapshots.push(structuredClone(conversation))
          return { turns: conversation.turns.map(turn => turn.type === 'assistant' ? { ...turn, rounds: turn.rounds.slice(-1) } : turn) }
        },
        onGeneratedTurn: (turn) => { result = turn },
      },
    })
    expect(snapshots).toHaveLength(4)
    expect(snapshots.map(snapshot => snapshot.turns.find(turn => turn.type === 'assistant')?.rounds.length ?? 0)).toEqual([0, 1, 2, 3])
    expect(requests).toHaveLength(4)
    expect(JSON.stringify(requests[3])).not.toContain('effect-1')
    expect(JSON.stringify(requests[3])).not.toContain('effect-2')
    expect(JSON.stringify(requests[3])).toContain('effect-3')
    expect(result?.rounds.map(round => round.id)).toEqual(['run/0', 'run/1', 'run/2', 'run/3'])
    expect(result?.rounds.map(round => round.toolInvocations[0]?.callId)).toEqual(['call-1', 'call-2', 'call-3', undefined])
    expect(result?.rounds.slice(0, 3).map(round => round.toolInvocations[0].execution)).toEqual([1, 2, 3].map(index => ({ status: 'succeeded', output: [{ type: 'text', text: `effect-${index}` }] })))
    expect(execute).toHaveBeenCalledTimes(3)
    expect(effects).toBe(3)
    expect(source.turns).toHaveLength(1)
  })
})
