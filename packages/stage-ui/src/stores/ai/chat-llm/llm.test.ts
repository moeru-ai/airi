import type { StreamOptions } from '@proj-airi/core-agent'
import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Event, Message, Tool } from '@xsai/shared-chat'
import type { StreamTextChunkResult, StreamTextOptions, StreamTextResult } from '@xsai/stream-text'

import type { ExecutableTool } from './tools'

import { createServer } from 'node:http'
import { env } from 'node:process'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isToolRelatedError, useLLM } from './llm'
import { useLlmToolsStore } from './tools'

const {
  streamTextMock,
  mcpMock,
  debugMock,
  createSparkCommandToolMock,
} = vi.hoisted(() => ({
  streamTextMock: vi.fn(),
  mcpMock: vi.fn(async (): Promise<Tool[]> => []),
  debugMock: vi.fn(async (): Promise<Tool[]> => []),
  createSparkCommandToolMock: vi.fn(async (): Promise<Tool[]> => [{
    type: 'function',
    function: {
      name: 'spark',
      description: '',
      parameters: { type: 'object', properties: {} },
    },
    execute: vi.fn(),
  }]),
}))

vi.mock('@xsai/model', () => ({
  listModels: vi.fn(),
}))

vi.mock('@xsai/stream-text', () => ({
  streamText: streamTextMock,
}))

vi.mock('../../../tools', () => ({
  mcp: mcpMock,
  debug: debugMock,
  createSparkCommandTool: createSparkCommandToolMock,
  // NOTICE: the resolver imports `createWebSearchTools` from the tools barrel, so
  // the mock must expose it or module loading fails with a missing-export error.
  createWebSearchTools: vi.fn(async (): Promise<Tool[]> => []),
}))

const provider = {
  chat: () => ({
    baseURL: 'https://example.com/',
  }),
} as unknown as ChatProvider

function createMockStreamResult() {
  return {
    steps: Promise.resolve([]),
    messages: Promise.resolve([]),
    usage: Promise.resolve({}),
    totalUsage: Promise.resolve({}),
  }
}

function toolNameFrom(tool: unknown) {
  if (typeof tool !== 'object' || tool === null)
    return undefined

  const candidate = tool as {
    name?: string
    function?: {
      name?: string
    }
  }

  return candidate.function?.name ?? candidate.name
}

function mockStreamEvents(events: unknown[]) {
  streamTextMock.mockImplementationOnce((options: { onEvent: (event: unknown) => void }) => {
    const steps = new Promise<unknown[]>((resolve) => {
      queueMicrotask(() => {
        for (const event of events)
          options.onEvent(event)
        resolve([])
      })
    })

    return { ...createMockStreamResult(), steps }
  })
}

function createSparkTool(): Tool {
  return {
    type: 'function',
    function: {
      name: 'builtIn_emitSparkCommand',
      description: 'Send a command to a connected game module.',
      parameters: { type: 'object', properties: {} },
    },
    execute: vi.fn(async () => 'ok'),
  }
}

describe('isToolRelatedError', () => {
  beforeEach(() => {
    streamTextMock.mockReset()
    mcpMock.mockClear()
    debugMock.mockClear()
    createSparkCommandToolMock.mockClear()
    setActivePinia(createPinia())
  })

  const positives: [provider: string, msg: string][] = [
    ['ollama', 'llama3 does not support tools'],
    ['ollama', 'phi does not support tools'],
    ['openrouter', 'No endpoints found that support tool use'],
    ['openai-compatible', 'Invalid schema for function \'myFunc\': \'dict\' is not valid under any of the given schemas'],
    ['openai-compatible', 'invalid_function_parameters'],
    ['openai-compatible', 'invalid function parameters'],
    ['azure', 'Functions are not supported at this time'],
    ['azure', 'Unrecognized request argument supplied: tools'],
    ['azure', 'Unrecognized request arguments supplied: tool_choice, tools'],
    ['google', 'Tool use with function calling is unsupported'],
    ['groq', 'tool_use_failed'],
    ['groq', 'Error code: tool_use_failed - Failed to call a function'],
    ['anthropic', 'This model does not support function calling'],
    ['anthropic', 'does not support function_calling'],
    ['cloudflare', 'tools is not supported'],
    ['cloudflare', 'tool is not supported for this model'],
    ['cloudflare', 'tools are not supported'],
  ]

  const negatives = [
    'network error',
    'timeout',
    'rate limit exceeded',
    'invalid api key',
    'model not found',
    'context length exceeded',
    '',
  ]

  for (const [provider, msg] of positives) {
    it(`matches [${provider}]: "${msg}"`, () => {
      expect(isToolRelatedError(msg)).toBe(true)
      expect(isToolRelatedError(new Error(msg))).toBe(true)
    })
  }

  for (const msg of negatives) {
    it(`rejects: "${msg}"`, () => {
      expect(isToolRelatedError(msg)).toBe(false)
      expect(isToolRelatedError(new Error(msg))).toBe(false)
    })
  }

  // ROOT CAUSE:
  //
  // The store forwards events through an async listener, even for synchronous consumers.
  // Before the fix, provider completion hid an error accepted behind that listener.
  // The core queue now rejects accepted errors before the store can report success.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3949844407
  it('rejects a queued error without saving partial messages or retrying for Issue #2161', async () => {
    const steps = Promise.withResolvers<unknown[]>()
    const listenerStarted = Promise.withResolvers<void>()
    const releaseListener = Promise.withResolvers<void>()
    const streamError = new Error('accepted provider error')
    const onMessages = vi.fn()
    const onStreamEvent = vi.fn<NonNullable<StreamOptions['onStreamEvent']>>(async (event) => {
      if (event.type === 'text-delta') {
        listenerStarted.resolve()
        await releaseListener.promise
      }
    })
    streamTextMock.mockImplementationOnce((options: { onEvent: (event: Event) => void }) => {
      options.onEvent({ type: 'text.delta', delta: 'partial answer' })
      options.onEvent({ type: 'error', message: streamError.message, cause: streamError })
      options.onEvent({ type: 'text.delta', delta: 'must not escape' })
      return { ...createMockStreamResult(), steps: steps.promise }
    })
    const result = useLLM().stream('model-a', provider, [], { onStreamEvent, onMessages }).then(() => undefined, error => error)
    await listenerStarted.promise
    steps.resolve([])
    await new Promise(resolve => setImmediate(resolve))
    releaseListener.resolve()

    expect(await result).toBe(streamError)
    expect(onStreamEvent.mock.calls.map(([event]) => event)).toEqual([
      { type: 'text-delta', text: 'partial answer' },
      { type: 'error', error: streamError },
    ])
    expect(onMessages).not.toHaveBeenCalled()
    expect(streamTextMock).toHaveBeenCalledTimes(1)
  })

  // ROOT CAUSE:
  //
  // Before the fix, provider failure rejected the store call while its listener still ran.
  // Later output could change consumer state after the caller handled failure.
  // The core queue now stops later events and waits for the active listener.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3949844417
  it('finishes the active consumer before rejection and discards queued output for Issue #2161', async () => {
    const steps = Promise.withResolvers<unknown[]>()
    const listenerStarted = Promise.withResolvers<void>()
    const releaseListener = Promise.withResolvers<void>()
    const streamError = new Error('steps failed during output')
    const mutations: string[] = []
    let settled = false
    const onStreamEvent = vi.fn<NonNullable<StreamOptions['onStreamEvent']>>(async () => {
      listenerStarted.resolve()
      await releaseListener.promise
      mutations.push(settled ? 'after rejection' : 'before rejection')
    })
    streamTextMock.mockImplementationOnce((options: { onEvent: (event: Event) => void }) => {
      options.onEvent({ type: 'text.delta', delta: 'first' })
      options.onEvent({ type: 'text.delta', delta: 'second' })
      return { ...createMockStreamResult(), steps: steps.promise }
    })
    const result = useLLM().stream('model-a', provider, [], { onStreamEvent }).then(
      () => { settled = true },
      (error) => {
        settled = true
        return error
      },
    )
    await listenerStarted.promise
    steps.reject(streamError)
    await new Promise(resolve => setImmediate(resolve))
    const settledBeforeRelease = settled
    releaseListener.resolve()
    const error = await result
    await new Promise(resolve => setImmediate(resolve))

    expect(settledBeforeRelease).toBe(false)
    expect(error).toBe(streamError)
    expect(mutations).toEqual(['before rejection'])
    expect(onStreamEvent.mock.calls.map(([event]) => event)).toEqual([{ type: 'text-delta', text: 'first' }])
    expect(streamTextMock).toHaveBeenCalledTimes(1)
  })

  it('resolves from steps and emits a single finish event', async () => {
    streamTextMock.mockImplementation(() => createMockStreamResult())

    const store = useLLM()
    const onStreamEvent = vi.fn()

    await store.stream('model-a', provider, [{ role: 'user', content: 'hello' }] as Message[], {
      waitForTools: true,
      onStreamEvent,
    })

    expect(onStreamEvent).toHaveBeenCalledTimes(1)
    expect(onStreamEvent).toHaveBeenCalledWith({ type: 'finish' })
  })

  it('ignores later error events after steps have resolved', async () => {
    let onEvent: ((event: unknown) => Promise<void>) | undefined
    let resolveSteps: ((steps: unknown[]) => void) | undefined
    streamTextMock.mockImplementation((options: { onEvent: (event: unknown) => Promise<void> }) => {
      onEvent = options.onEvent
      return {
        ...createMockStreamResult(),
        steps: new Promise<unknown[]>((resolve) => {
          resolveSteps = resolve
        }),
      }
    })

    const store = useLLM()
    const pending = store.stream('model-a', provider, [{ role: 'user', content: 'hello' }] as Message[], {
      waitForTools: true,
    })

    await vi.waitFor(() => expect(onEvent).toBeTypeOf('function'))
    resolveSteps?.([])
    await Promise.resolve()
    await onEvent!({ type: 'error', message: 'stream failed', cause: new Error('stream failed') })
    await expect(pending).resolves.toBeUndefined()
  })

  it('keeps builtin tools when stream steps resolve before a tool-related error event', async () => {
    const transcriptStarted = Promise.withResolvers<void>()
    const releaseTranscript = Promise.withResolvers<void>()
    const providerStarted = Promise.withResolvers<(event: Event) => void>()
    const store = useLLM()
    const llmToolsStore = useLlmToolsStore()
    const customTool = {
      type: 'function',
      function: {
        name: 'custom-tool',
        description: 'Custom tool.',
        parameters: { type: 'object', properties: {} },
      },
      execute: vi.fn(async () => 'ok'),
    } satisfies Tool
    const runtimeTool = {
      id: 'plugin:chess:runtime_play_chess_match',
      type: 'function' as const,
      function: {
        name: 'runtime_play_chess_match',
        description: 'Start a runtime chess match.',
        parameters: { type: 'object', properties: {} },
      },
      execute: vi.fn(async () => ({ ok: true })),
    } satisfies ExecutableTool

    llmToolsStore.addTools(runtimeTool)

    streamTextMock.mockImplementationOnce((options: { onEvent: (event: Event) => void }) => {
      providerStarted.resolve(options.onEvent)
      return createMockStreamResult()
    })

    const pending = store.stream('model-a', provider, [{ role: 'user', content: 'hello' }] as Message[], {
      tools: [customTool],
      onMessages: async () => {
        transcriptStarted.resolve()
        await releaseTranscript.promise
      },
    })
    // The old fixture queued its error before the completion observer ran.
    // Transcript delivery proves that accepted events finished and admission closed.
    await transcriptStarted.promise
    const onEvent = await providerStarted.promise
    onEvent({ type: 'error', message: 'model does not support tools', cause: new Error('model does not support tools') })
    releaseTranscript.resolve()
    await expect(pending).resolves.toBeUndefined()

    const firstCallTools = streamTextMock.mock.calls[0]?.[0]?.tools
    expect(Array.isArray(firstCallTools)).toBe(true)
    expect(mcpMock).toHaveBeenCalledTimes(1)
    expect(debugMock).toHaveBeenCalledTimes(1)
    expect(firstCallTools?.map(toolNameFrom)).toContain('custom-tool')
    expect(firstCallTools?.map(toolNameFrom)).toContain('runtime_play_chess_match')

    streamTextMock.mockImplementationOnce(() => createMockStreamResult())

    await store.stream('model-a', provider, [{ role: 'user', content: 'hello again' }] as Message[], {
      tools: [customTool],
    })

    const secondCallTools = streamTextMock.mock.calls[1]?.[0]?.tools
    expect(Array.isArray(secondCallTools)).toBe(true)
    expect(secondCallTools?.map(toolNameFrom)).toContain('runtime_play_chess_match')
  })

  // ROOT CAUSE:
  // Native events disabled inspection before the store saw a leak error.
  // Native activity must also prevent retries when its UI event is still buffered.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3950440962
  it.each(['tool-call.start', 'tool-call.delta', 'tool-call.done'] as const)('does not replay buffered output after %s for Issue #2161', async (type) => {
    const onStreamEvent = vi.fn()
    const onMessages = vi.fn()
    const nativeEvent: Event = type === 'tool-call.start'
      ? { type, toolCallId: 'call-1', toolName: 'builtIn_emitSparkCommand' }
      : type === 'tool-call.delta'
        ? { type, delta: '{}' }
        : { type, toolCallId: 'call-1', toolName: 'builtIn_emitSparkCommand', toolCallType: 'function', args: '{}' }
    mockStreamEvents([
      { type: 'reasoning.delta', delta: '{"name":"builtIn_emitSparkCommand","arguments":{}}' },
      nativeEvent,
    ] satisfies Event[])
    await expect(useLLM().stream('model-a', provider, [], {
      tools: [createSparkTool()],
      onStreamEvent,
      onMessages,
    })).rejects.toThrow('tool call "builtIn_emitSparkCommand" as plain text')
    expect(streamTextMock).toHaveBeenCalledTimes(1)
    expect(onStreamEvent).not.toHaveBeenCalled()
    expect(onMessages).not.toHaveBeenCalled()
  })

  // ROOT CAUSE:
  // Native events released leaks, and retry errors bypassed compatibility checks.
  // These tests use the real SDK and scripted HTTP responses to check both fixes.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3950440962
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3950440972
  it.runIf(env.AIRI_TEST_REAL_SSE === '1').each(['native-text', 'native-reasoning', 'native-safe', 'tools-first', 'arrays-first'] as const)('checks %s with real xsAI and HTTP/SSE for Issue #2161', async (scenario) => {
    const { streamText } = await vi.importActual<typeof import('@xsai/stream-text')>('@xsai/stream-text')
    const sdkResults: StreamTextResult[] = []
    streamTextMock.mockImplementation((options: Parameters<typeof streamText>[0]) => {
      const result = streamText(options)
      sdkResults.push(result)
      return result
    })
    const requests: Pick<StreamTextOptions, 'messages' | 'tools'>[] = []
    const call = '{"name":"builtIn_emitSparkCommand","arguments":{}}'
    const native = scenario.startsWith('native')
    const onStreamEvent = vi.fn()
    const onMessages = vi.fn()
    const tool = createSparkTool()
    const controller = new AbortController()
    const server = createServer((request, response) => {
      void (async () => {
        let raw = ''
        for await (const part of request)
          raw += part.toString()
        requests.push(JSON.parse(raw))
        const attempt = requests.length
        if (!native && attempt === (scenario === 'tools-first' ? 2 : 1)) {
          response.writeHead(400, { 'Content-Type': 'application/json' })
          response.end(JSON.stringify({ error: { message: 'messages[0]: invalid type: sequence, expected a string' } }))
          return
        }
        response.writeHead(200, { 'Content-Type': 'text/event-stream' })
        const send = (delta: StreamTextChunkResult['choices'][number]['delta'], finishReason = 'stop') => {
          response.write(`data: ${JSON.stringify({
            id: 'fixture',
            object: 'chat.completion.chunk',
            model: 'fixture',
            choices: [{ index: 0, delta, finish_reason: finishReason }],
          })}\n\n`)
        }
        if (native && attempt === 1) {
          const text = scenario === 'native-safe' ? '{"note":"safe"}' : call
          send(scenario === 'native-text'
            ? { role: 'assistant', content: text }
            : { role: 'assistant', reasoning_content: text }, 'tool_calls')
          send({ role: 'assistant', tool_calls: [{
            index: 0,
            id: 'call-1',
            type: 'function',
            function: { name: 'builtIn_emitSparkCommand', arguments: '{}' },
          }] }, 'tool_calls')
        }
        else {
          const leakAttempt = !native && attempt === (scenario === 'tools-first' ? 1 : 2)
          send({ role: 'assistant', content: leakAttempt ? call : 'Recovered.' })
        }
        response.end('data: [DONE]\n\n')
      })().catch((error) => { response.destroy(error) })
    })
    try {
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      const address = server.address()
      if (!address || typeof address === 'string')
        throw new Error('The loopback server did not get a TCP port.')
      const localProvider = {
        chat: (model: string) => ({ model, baseURL: `http://127.0.0.1:${address.port}/v1/` }),
      } as ChatProvider
      const outcome = await useLLM().stream('fixture', localProvider, [{ role: 'user', content: [
        { type: 'text', text: 'Play.' },
        { type: 'image_url', image_url: { url: 'https://example.com/game.png' } },
      ] }], { tools: [tool], abortSignal: controller.signal, onStreamEvent, onMessages }).then(() => undefined, error => error)
      // The SDK can finish its tool round after the guard rejects UI output.
      await Promise.allSettled(sdkResults.map(result => result.steps))
      if (native) {
        expect(tool.execute).toHaveBeenCalledTimes(1)
        expect(streamTextMock).toHaveBeenCalledTimes(1)
        expect(requests).toHaveLength(2)
        expect(requests[1].messages).toContainEqual(expect.objectContaining({ role: 'tool', tool_call_id: 'call-1' }))
        if (scenario === 'native-safe') {
          expect(outcome).toBeUndefined()
          expect(onMessages).toHaveBeenCalledTimes(1)
          expect(onStreamEvent.mock.calls.map(([event]) => event.type)).toEqual(['reasoning-delta', 'tool-call', 'tool-result', 'text-delta', 'finish'])
        }
        else {
          expect(String(outcome)).toContain('as plain text')
          expect(onStreamEvent).not.toHaveBeenCalled()
          expect(onMessages).not.toHaveBeenCalled()
        }
      }
      else {
        expect(outcome).toBeUndefined()
        expect(tool.execute).not.toHaveBeenCalled()
        expect(streamTextMock).toHaveBeenCalledTimes(3)
        expect(requests.map(body => ({ tools: !!body.tools, array: Array.isArray(body.messages[0].content) }))).toEqual([
          { tools: true, array: true },
          { tools: scenario === 'arrays-first', array: scenario === 'tools-first' },
          { tools: false, array: false },
        ])
        expect(onStreamEvent.mock.calls.map(([event]) => event)).toEqual([
          { type: 'text-delta', text: 'Recovered.' },
          { type: 'finish' },
        ])
        expect(onMessages).toHaveBeenCalledTimes(1)
      }
    }
    finally {
      controller.abort()
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })

  // ROOT CAUSE:
  // Errors from an inline retry bypassed the other compatibility classifier.
  // Every attempt must use the same classifier, with at most one retry per capability.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3950440972
  it.each(['tools-first', 'arrays-first'] as const)('combines both compatibility fallbacks, %s, for Issue #2161', async (order) => {
    const messages: Message[] = [{ role: 'user', content: [
      { type: 'text', text: 'Play.' },
      { type: 'image_url', image_url: { url: 'https://example.com/game.png' } },
    ] }]
    const arrayError = new Error('messages[0]: invalid type: sequence, expected a string')
    const mockLeak = () => mockStreamEvents([{ type: 'reasoning.delta', delta: '{"name":"builtIn_emitSparkCommand","arguments":{}}' }])
    const mockArrayError = () => streamTextMock.mockImplementationOnce(() => {
      throw arrayError
    })
    if (order === 'tools-first') {
      mockLeak()
      mockArrayError()
    }
    else {
      mockArrayError()
      mockLeak()
    }
    mockStreamEvents([{ type: 'text.delta', delta: 'Recovered.' }])
    const store = useLLM()
    const onStreamEvent = vi.fn()
    const options = { tools: [createSparkTool()], onStreamEvent }
    await store.stream('model-a', provider, messages, options)
    expect(streamTextMock).toHaveBeenCalledTimes(3)
    const attempts = streamTextMock.mock.calls.map(([attempt]) => ({
      tools: attempt.tools !== undefined,
      array: Array.isArray(attempt.messages[0].content),
    }))
    expect(attempts).toEqual([
      { tools: true, array: true },
      { tools: order !== 'tools-first', array: order === 'tools-first' },
      { tools: false, array: false },
    ])
    expect(onStreamEvent.mock.calls.map(([event]) => event)).toEqual([
      { type: 'text-delta', text: 'Recovered.' },
      { type: 'finish' },
    ])
    mockStreamEvents([])
    await store.stream('model-a', provider, messages, options)
    expect(streamTextMock.mock.calls[3][0].tools).toBeUndefined()
    expect(streamTextMock.mock.calls[3][0].messages[0].content).toBe('Play.')
    expect(Array.isArray(messages[0].content)).toBe(true)
  })

  // ROOT CAUSE:
  // Reclassifying retry errors must not create unbounded retries.
  // Each capability changes once, so repeated errors stop the request.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3950440972
  it.each(['tool-leak', 'array-error'] as const)('stops after both fallbacks when %s repeats for Issue #2161', async (failure) => {
    const arrayError = new Error('messages[0]: invalid type: sequence, expected a string')
    const leak: Event = { type: 'text.delta', delta: '{"name":"builtIn_emitSparkCommand","arguments":{}}' }
    mockStreamEvents([leak])
    streamTextMock.mockImplementationOnce(() => {
      throw arrayError
    })
    if (failure === 'tool-leak') {
      mockStreamEvents([leak])
    }
    else {
      streamTextMock.mockImplementationOnce(() => {
        throw arrayError
      })
    }
    const onStreamEvent = vi.fn()
    await expect(useLLM().stream('model-a', provider, [], {
      tools: [createSparkTool()],
      onStreamEvent,
    })).rejects.toThrow(failure === 'tool-leak' ? 'as plain text' : arrayError.message)
    expect(streamTextMock).toHaveBeenCalledTimes(3)
    expect(streamTextMock.mock.calls[2][0].tools).toBeUndefined()
    expect(onStreamEvent).not.toHaveBeenCalled()
  })

  // ROOT CAUSE:
  // The array fallback ignored committed output and tool activity.
  // Both fallbacks now reject after a consumer or native tool can change state.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3950440972
  it.each(['text.delta', 'reasoning.delta', 'native', 'messages', 'finish'] as const)('does not replay a content-array error after %s for Issue #2161', async (activity) => {
    const arrayError = new Error('messages[0]: invalid type: sequence, expected a string')
    const onStreamEvent = vi.fn<NonNullable<StreamOptions['onStreamEvent']>>((event) => {
      if (activity === 'finish' && event.type === 'finish')
        throw arrayError
    })
    const onMessages = vi.fn(() => {
      if (activity === 'messages')
        throw arrayError
    })
    const events: Event[] = activity === 'native'
      ? [
          { type: 'reasoning.delta', delta: '{"ordinary":1}' },
          { type: 'tool-call.start', toolCallId: 'call-1', toolName: 'builtIn_emitSparkCommand' },
          { type: 'error', message: arrayError.message, cause: arrayError },
        ]
      : activity === 'messages' || activity === 'finish'
        ? []
        : [{ type: activity, delta: 'visible prefix' }, { type: 'error', message: arrayError.message, cause: arrayError }]
    mockStreamEvents(events)
    await expect(useLLM().stream('model-a', provider, [], {
      tools: [createSparkTool()],
      onStreamEvent,
      onMessages,
    })).rejects.toBe(arrayError)
    expect(streamTextMock).toHaveBeenCalledTimes(1)
    if (activity === 'native')
      expect(onStreamEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'reasoning-delta' }))
  })

  // ROOT CAUSE:
  // Explicit array support overrides the cache, so a cached downgrade changes nothing.
  // Reject the error instead of retrying the same payload.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3950440972
  it.each([true, false] as const)('does not retry unchanged explicit array support %s for Issue #2161', async (supportsContentArray) => {
    const arrayError = new Error('messages[0]: invalid type: sequence, expected a string')
    streamTextMock.mockImplementationOnce(() => {
      throw arrayError
    })
    await expect(useLLM().stream('model-a', provider, [], { supportsContentArray })).rejects.toBe(arrayError)
    expect(streamTextMock).toHaveBeenCalledTimes(1)
  })

  // ROOT CAUSE:
  // A retry can expose a second capability error on a required-tool request.
  // Array fallback must preserve the tool choice and reject a later leak.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3950440972
  it('keeps a required tool choice after the array fallback for Issue #2161', async () => {
    streamTextMock.mockImplementationOnce(() => {
      throw new Error('messages[0]: invalid type: sequence, expected a string')
    })
    mockStreamEvents([{ type: 'text.delta', delta: '{"name":"builtIn_emitSparkCommand","arguments":{}}' }])
    await expect(useLLM().stream('model-a', provider, [], {
      toolChoice: 'required',
      tools: [createSparkTool()],
    })).rejects.toThrow('as plain text')
    expect(streamTextMock).toHaveBeenCalledTimes(2)
    expect(streamTextMock.mock.calls[1][0].toolChoice).toBe('required')
    expect(streamTextMock.mock.calls[1][0].tools.map(toolNameFrom)).toContain('builtIn_emitSparkCommand')
  })

  // ROOT CAUSE:
  //
  // Some providers emit a registered tool call as assistant text instead of
  // using the native tool protocol.
  //
  // Before the fix, that raw JSON reached the chat UI and later requests kept
  // sending the same incompatible tool payload.
  //
  // We fixed this by retrying once without tools only before any output or tool
  // work is committed, then caching the model's incompatibility.
  // https://github.com/moeru-ai/airi/issues/2161
  it('retries without tools when a model emits a plain-text tool call for Issue #2161', async () => {
    const rawToolCall = JSON.stringify({
      name: 'builtIn_emitSparkCommand',
      parameters: { destinations: [] },
    })
    const fallbackText = 'I cannot play a game because no game tool is available.'
    const customTool = createSparkTool()
    const events: unknown[] = []
    const splitAt = Math.floor(rawToolCall.length / 2)

    mockStreamEvents([
      { type: 'text.delta', delta: rawToolCall.slice(0, splitAt) },
      { type: 'text.delta', delta: rawToolCall.slice(splitAt) },
    ])
    mockStreamEvents([
      { type: 'text.delta', delta: fallbackText },
    ])

    const store = useLLM()
    await store.stream('model-a', provider, [{ role: 'user', content: 'Can you play games?' }] as Message[], {
      supportsTools: true,
      toolChoice: 'auto',
      tools: [customTool],
      onStreamEvent: (event) => {
        events.push(event)
      },
    })

    expect(streamTextMock).toHaveBeenCalledTimes(2)
    expect(streamTextMock.mock.calls[0]?.[0]?.tools?.map(toolNameFrom)).toContain('builtIn_emitSparkCommand')
    expect(streamTextMock.mock.calls[0]?.[0]?.toolChoice).toBe('auto')
    expect(streamTextMock.mock.calls[1]?.[0]?.tools).toBeUndefined()
    expect(streamTextMock.mock.calls[1]?.[0]?.toolChoice).toBeUndefined()
    expect(events
      .filter((event): event is { type: 'text-delta', text: string } => (
        typeof event === 'object' && event !== null && (event as { type?: unknown }).type === 'text-delta'
      ))
      .map(event => event.text)
      .join(''))
      .toBe(fallbackText)

    streamTextMock.mockImplementationOnce(() => createMockStreamResult())
    await store.stream('model-a', provider, [{ role: 'user', content: 'Try again.' }] as Message[], {
      supportsTools: true,
      toolChoice: 'auto',
      tools: [customTool],
    })

    expect(streamTextMock).toHaveBeenCalledTimes(3)
    expect(streamTextMock.mock.calls[2]?.[0]?.tools).toBeUndefined()
    expect(streamTextMock.mock.calls[2]?.[0]?.toolChoice).toBeUndefined()
  })

  // ROOT CAUSE:
  //
  // A later plain-text tool-call failure could occur after an earlier native
  // tool event had already committed work in the same request.
  //
  // Before the fix, automatically replaying that request could execute the
  // earlier tool work a second time.
  //
  // We fixed this by caching the incompatibility without replaying any attempt
  // that has already emitted output or native tool activity.
  // https://github.com/moeru-ai/airi/issues/2161
  it('does not replay earlier native tool work after a later plain-text tool call for Issue #2161', async () => {
    const rawToolCall = JSON.stringify({
      name: 'builtIn_emitSparkCommand',
      parameters: { destinations: [] },
    })
    const customTool = createSparkTool()
    const events: unknown[] = []

    mockStreamEvents([
      { type: 'step.start' },
      {
        type: 'tool-call.done',
        args: '{}',
        toolCallId: 'call-1',
        toolCallType: 'function',
        toolName: 'builtIn_emitSparkCommand',
      },
      { type: 'step.done', usage: {} },
      { type: 'step.start' },
      { type: 'text.delta', delta: rawToolCall },
      { type: 'step.done', usage: {} },
    ])
    streamTextMock.mockImplementationOnce(() => createMockStreamResult())

    const store = useLLM()
    await expect(store.stream('model-a', provider, [{ role: 'user', content: 'Can you play games?' }] as Message[], {
      supportsTools: true,
      toolChoice: 'auto',
      tools: [customTool],
      onStreamEvent: (event) => {
        events.push(event)
      },
    })).rejects.toThrow('tool call "builtIn_emitSparkCommand" as plain text')

    expect(streamTextMock).toHaveBeenCalledTimes(1)
    expect(events).toContainEqual(expect.objectContaining({
      type: 'tool-call',
      toolCallId: 'call-1',
    }))

    await store.stream('model-a', provider, [{ role: 'user', content: 'Try again.' }] as Message[], {
      supportsTools: true,
      toolChoice: 'auto',
      tools: [customTool],
    })

    expect(streamTextMock).toHaveBeenCalledTimes(2)
    expect(streamTextMock.mock.calls[1]?.[0]?.tools).toBeUndefined()
    expect(streamTextMock.mock.calls[1]?.[0]?.toolChoice).toBeUndefined()
  })

  // ROOT CAUSE:
  //
  // A forced request that leaked a text tool call marked the model as tool-
  // incompatible, so the cache stripped tools from the next forced request.
  //
  // Before the fix, that later request could resolve without ever performing
  // the required Spark command.
  //
  // We fixed this by letting required choices bypass the compatibility cache
  // while still rejecting them when no tools are actually available.
  // https://github.com/moeru-ai/airi/issues/2161
  it('does not downgrade a forced tool choice after a plain-text leak for Issue #2161', async () => {
    const rawToolCall = JSON.stringify({
      name: 'builtIn_emitSparkCommand',
      parameters: { destinations: [] },
    })
    const customTool = createSparkTool()

    mockStreamEvents([
      { type: 'text.delta', delta: rawToolCall },
    ])

    const store = useLLM()
    const options = {
      supportsTools: true,
      toolChoice: {
        type: 'function',
        function: { name: 'builtIn_emitSparkCommand' },
      },
      tools: [customTool],
    } satisfies StreamOptions

    await expect(store.stream('model-a', provider, [{ role: 'user', content: 'You must play a game.' }] as Message[], options)).rejects.toThrow('tool call "builtIn_emitSparkCommand" as plain text')

    expect(streamTextMock).toHaveBeenCalledTimes(1)

    mockStreamEvents([
      { type: 'text.delta', delta: rawToolCall },
    ])

    await expect(store.stream('model-a', provider, [{ role: 'user', content: 'You still must play a game.' }] as Message[], options)).rejects.toThrow('tool call "builtIn_emitSparkCommand" as plain text')

    expect(streamTextMock).toHaveBeenCalledTimes(2)
    expect(streamTextMock.mock.calls[1]?.[0]?.tools?.map(toolNameFrom)).toContain('builtIn_emitSparkCommand')
    expect(streamTextMock.mock.calls[1]?.[0]?.toolChoice).toEqual(options.toolChoice)
  })

  // ROOT CAUSE:
  //
  // The tool-free retry skipped tool resolution and lost the original tool names.
  // Before the fix, a repeated JSON call reached the UI and the request succeeded.
  // We retain the resolved names for detection across attempts of the same request.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3932132876
  it.each(['text.delta', 'reasoning.delta'])('rejects a repeated tool JSON in %s on the tool-free retry for Issue #2161', async (type) => {
    const customTool = createSparkTool()
    const customTools = vi.fn(async () => [customTool])
    const rawToolCall = JSON.stringify({ name: 'builtIn_emitSparkCommand', parameters: { destinations: [] } })
    const onStreamEvent = vi.fn()
    const onMessages = vi.fn()
    mockStreamEvents([{ type: 'text.delta', delta: rawToolCall }])
    mockStreamEvents([{ type, delta: rawToolCall }])

    await expect(useLLM().stream('model-a', provider, [
      { role: 'system', content: 'Use builtIn_emitSparkCommand to play games.' },
      { role: 'user', content: 'Can you play games?' },
    ], { tools: customTools, toolChoice: 'auto', onStreamEvent, onMessages })).rejects.toThrow('tool call "builtIn_emitSparkCommand" as plain text')

    expect(streamTextMock).toHaveBeenCalledTimes(2)
    expect(streamTextMock.mock.calls[0]?.[0]?.tools?.map(toolNameFrom)).toContain('builtIn_emitSparkCommand')
    expect(streamTextMock.mock.calls[1]?.[0]?.tools).toBeUndefined()
    expect(streamTextMock.mock.calls[1]?.[0]?.toolChoice).toBeUndefined()
    expect(customTools).toHaveBeenCalledTimes(1)
    expect(customTool.execute).not.toHaveBeenCalled()
    expect(onStreamEvent).not.toHaveBeenCalled()
    expect(onMessages).not.toHaveBeenCalled()
  })

  // ROOT CAUSE:
  //
  // Balanced but invalid nested objects exhausted synchronous parsing work.
  // This failure rejects without a retry or a tool compatibility downgrade.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3953824377
  it.each(['text.delta', 'reasoning.delta'] as const)('rejects excessive JSON inspection in %s without a downgrade for Issue #2161', async (type) => {
    const store = useLLM()
    const customTool = createSparkTool()
    const answer = `${'{"a":'.repeat(512)}x${'}'.repeat(512)}`
    const onStreamEvent = vi.fn()
    const onMessages = vi.fn()
    mockStreamEvents([{ type, delta: answer }])

    await expect(store.stream('model-a', provider, [], {
      tools: [customTool],
      onStreamEvent,
      onMessages,
    })).rejects.toThrow('Model output exceeded the JSON inspection work limit.')

    expect(streamTextMock).toHaveBeenCalledTimes(1)
    expect(customTool.execute).not.toHaveBeenCalled()
    expect(onStreamEvent).not.toHaveBeenCalled()
    expect(onMessages).not.toHaveBeenCalled()

    mockStreamEvents([{ type: 'text.delta', delta: 'A safe answer.' }])
    await store.stream('model-a', provider, [], { tools: [customTool], onStreamEvent })

    expect(streamTextMock).toHaveBeenCalledTimes(2)
    expect(streamTextMock.mock.calls[1]?.[0]?.tools?.map(toolNameFrom)).toContain(customTool.function.name)
    expect(onStreamEvent).toHaveBeenCalledWith({ type: 'text-delta', text: 'A safe answer.' })
    expect(onStreamEvent).toHaveBeenCalledWith({ type: 'finish' })
  })

  // ROOT CAUSE:
  //
  // A later JSON call can follow a prefix that already reached the caller.
  // Before the fix, this call bypassed the guard and the stream succeeded.
  // We reject the call without retrying or replaying the visible prefix.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3932132863
  it('does not retry a leak after visible text for Issue #2161', async () => {
    const onStreamEvent = vi.fn()
    const onMessages = vi.fn()
    const customTool = createSparkTool()
    mockStreamEvents([
      { type: 'text.delta', delta: 'I will call the game tool.\n' },
      { type: 'text.delta', delta: '{"name":"builtIn_emitSparkCommand","parameters":{}}' },
    ])

    await expect(useLLM().stream('model-a', provider, [], {
      tools: [customTool],
      onStreamEvent,
      onMessages,
    })).rejects.toThrow('tool call "builtIn_emitSparkCommand" as plain text')

    expect(streamTextMock).toHaveBeenCalledTimes(1)
    expect(onStreamEvent).toHaveBeenCalledExactlyOnceWith({ type: 'text-delta', text: 'I will call the game tool.\n' })
    expect(onMessages).not.toHaveBeenCalled()
    expect(customTool.execute).not.toHaveBeenCalled()
  })

  // ROOT CAUSE:
  //
  // A later request had no guard names because the capability cache skipped its resolver.
  // Before the fix, the default Spark prompt could produce an unchecked JSON call.
  // We resolve current names for cache-disabled requests without sending tools or retrying them.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3949439833
  it.each(['text.delta', 'reasoning.delta'])('guards a later cache-disabled request in %s for Issue #2161', async (type) => {
    const sparkTool = createSparkTool()
    sparkTool.function.name = 'builtIn_sparkCommand'
    createSparkCommandToolMock.mockResolvedValueOnce([sparkTool]).mockResolvedValueOnce([sparkTool])
    const rawToolCall = '{"name":"builtIn_sparkCommand","arguments":{}}'
    const store = useLLM()
    mockStreamEvents([{ type: 'text.delta', delta: rawToolCall }])
    mockStreamEvents([{ type: 'text.delta', delta: 'No tool is available.' }])
    await store.stream('model-a', provider, [])

    const onStreamEvent = vi.fn()
    const onMessages = vi.fn()
    mockStreamEvents([{ type, delta: rawToolCall }])
    await expect(store.stream('model-a', provider, [
      { role: 'system', content: 'Use builtIn_sparkCommand to send a game command.' },
    ], { toolChoice: 'auto', onStreamEvent, onMessages })).rejects.toThrow('tool call "builtIn_sparkCommand" as plain text')

    expect(streamTextMock).toHaveBeenCalledTimes(3)
    expect(streamTextMock.mock.calls[2]?.[0]?.tools).toBeUndefined()
    expect(streamTextMock.mock.calls[2]?.[0]?.toolChoice).toBeUndefined()
    expect(createSparkCommandToolMock).toHaveBeenCalledTimes(2)
    expect(sparkTool.execute).not.toHaveBeenCalled()
    expect(onStreamEvent).not.toHaveBeenCalled()
    expect(onMessages).not.toHaveBeenCalled()
  })

  // ROOT CAUSE:
  //
  // Ordinary reasoning was hidden, so a later leak could replay the whole request.
  // We now emit ordinary reasoning immediately and treat it as committed output.
  // A later leak rejects without replaying that output or emitting the raw JSON.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3949439849
  it('does not retry a leak after visible reasoning for Issue #2161', async () => {
    const onStreamEvent = vi.fn()
    const onMessages = vi.fn()
    mockStreamEvents([
      { type: 'reasoning.delta', delta: 'Let me think.' },
      { type: 'text.delta', delta: '{"name":"builtIn_emitSparkCommand","parameters":{}}' },
    ])
    mockStreamEvents([{ type: 'text.delta', delta: 'A repeated answer.' }])

    await expect(useLLM().stream('model-a', provider, [], {
      tools: [createSparkTool()],
      onStreamEvent,
      onMessages,
    })).rejects.toThrow('tool call "builtIn_emitSparkCommand" as plain text')

    expect(streamTextMock).toHaveBeenCalledTimes(1)
    expect(onStreamEvent).toHaveBeenCalledExactlyOnceWith({ type: 'reasoning-delta', text: 'Let me think.' })
    expect(onMessages).not.toHaveBeenCalled()
  })

  it('keeps retry tool names isolated between requests to the same model', async () => {
    const rawToolCall = '{"name":"builtIn_emitSparkCommand","parameters":{}}'
    const store = useLLM()
    mockStreamEvents([{ type: 'text.delta', delta: rawToolCall }])
    mockStreamEvents([{ type: 'text.delta', delta: 'No tool is available.' }])
    await store.stream('model-a', provider, [], { tools: [createSparkTool()] })

    const onStreamEvent = vi.fn()
    const customTools = vi.fn(async () => [createSparkTool()])
    mockStreamEvents([{ type: 'text.delta', delta: rawToolCall }])
    await store.stream('model-a', provider, [
      { role: 'user', content: 'Quote this JSON as a documentation example.' },
    ], { supportsTools: false, tools: customTools, onStreamEvent })

    expect(streamTextMock).toHaveBeenCalledTimes(3)
    expect(customTools).not.toHaveBeenCalled()
    expect(mcpMock).toHaveBeenCalledTimes(1)
    expect(onStreamEvent).toHaveBeenCalledWith({ type: 'text-delta', text: rawToolCall })
    expect(onStreamEvent).toHaveBeenCalledWith({ type: 'finish' })
  })

  // ROOT CAUSE:
  //
  // The capability cache skipped tool resolution on later requests.
  // Reusing old names would instead mix unrelated request tools.
  // We resolve each request's current tools for detection, even after cache downgrade.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3949439833
  it('uses current custom tools after a cached downgrade for Issue #2161', async () => {
    const store = useLLM()
    const oldCall = '{"name":"builtIn_emitSparkCommand","arguments":{}}'
    mockStreamEvents([{ type: 'text.delta', delta: oldCall }])
    mockStreamEvents([{ type: 'text.delta', delta: 'No tool is available.' }])
    await store.stream('model-a', provider, [], { tools: [createSparkTool()] })

    const newTool = createSparkTool()
    newTool.function.name = 'new_game_tool'
    const currentTools = vi.fn(async () => [newTool])
    const onStreamEvent = vi.fn()
    mockStreamEvents([{ type: 'text.delta', delta: oldCall }])
    await store.stream('model-a', provider, [], { tools: currentTools, onStreamEvent })
    expect(onStreamEvent).toHaveBeenCalledWith({ type: 'text-delta', text: oldCall })
    expect(onStreamEvent).toHaveBeenCalledWith({ type: 'finish' })

    onStreamEvent.mockClear()
    mockStreamEvents([{ type: 'text.delta', delta: '{"name":"new_game_tool","arguments":{}}' }])
    await expect(store.stream('model-a', provider, [], {
      tools: currentTools,
      onStreamEvent,
    })).rejects.toThrow('tool call "new_game_tool" as plain text')

    expect(currentTools).toHaveBeenCalledTimes(2)
    expect(newTool.execute).not.toHaveBeenCalled()
    expect(streamTextMock).toHaveBeenCalledTimes(4)
    expect(streamTextMock.mock.calls[2]?.[0]?.tools).toBeUndefined()
    expect(streamTextMock.mock.calls[3]?.[0]?.tools).toBeUndefined()
    expect(onStreamEvent).not.toHaveBeenCalled()
  })

  it('merges runtime-registered tools from the llm-tools store into the builtin tool resolver', async () => {
    const store = useLLM()
    const llmToolsStore = useLlmToolsStore()
    const playChessTool = {
      id: 'plugin:chess:runtime_open_chess_board',
      type: 'function' as const,
      function: {
        name: 'runtime_open_chess_board',
        description: 'Open the runtime chess board.',
        parameters: { type: 'object', properties: {} },
      },
      execute: vi.fn(async () => ({ ok: true })),
    } satisfies ExecutableTool
    const runtimeMcpStatusTool = {
      id: 'mcp:runtime_sync_mcp_status',
      type: 'function' as const,
      function: {
        name: 'runtime_sync_mcp_status',
        description: 'Sync runtime MCP status.',
        parameters: { type: 'object', properties: {} },
      },
      execute: vi.fn(async () => ({ ok: true })),
    } satisfies ExecutableTool

    llmToolsStore.addTools(runtimeMcpStatusTool, playChessTool)

    streamTextMock.mockImplementationOnce(() => createMockStreamResult())

    await store.stream('model-a', provider, [{ role: 'user', content: 'play chess' }] as Message[])

    const mergedTools = streamTextMock.mock.calls[0]?.[0]?.tools
    expect(mergedTools?.map(toolNameFrom)).toEqual(expect.arrayContaining([
      'runtime_sync_mcp_status',
      'runtime_open_chess_board',
    ]))
  })

  it('prefers runtime-registered tools when duplicate tool names collide with builtin tools', async () => {
    const store = useLLM()
    const llmToolsStore = useLlmToolsStore()
    const builtinTool = {
      type: 'function',
      function: {
        name: 'duplicate_runtime_tool',
        description: 'Builtin version.',
        parameters: { type: 'object', properties: {} },
      },
      execute: vi.fn(),
    } as unknown as Tool
    const runtimeTool = {
      id: 'plugin:runtime:duplicate_runtime_tool',
      type: 'function' as const,
      function: {
        name: 'duplicate_runtime_tool',
        description: 'Runtime version.',
        parameters: { type: 'object', properties: {} },
      },
      execute: vi.fn(async () => ({ ok: true })),
    } satisfies ExecutableTool

    mcpMock.mockResolvedValueOnce([builtinTool] as Tool[])
    llmToolsStore.addTools(runtimeTool)

    streamTextMock.mockImplementationOnce(() => createMockStreamResult())

    await store.stream('model-a', provider, [{ role: 'user', content: 'play chess' }] as Message[])

    const mergedTools = streamTextMock.mock.calls[0]?.[0]?.tools as Array<{ function?: { name?: string, description?: string } }>
    const duplicateNameTools = mergedTools.filter(tool => tool.function?.name === 'duplicate_runtime_tool')

    expect(duplicateNameTools).toHaveLength(1)
    expect(duplicateNameTools[0]).toMatchObject({
      function: {
        name: 'duplicate_runtime_tool',
        description: 'Runtime version.',
      },
    })
  })
})
