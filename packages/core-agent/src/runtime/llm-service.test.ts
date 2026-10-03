import type { GenerationProvider } from '@proj-airi/provider-inference'
import type { CompletionStep, Message, Tool } from '@xsai/shared-chat'

import type { Conversation } from '../messages/types'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { chatMessagesToTurns, conversationToChatMessages } from '../messages/chat-completions'
import { isContentArrayRelatedError, streamFrom } from './llm-service'

const { streamTextMock } = vi.hoisted(() => ({
  streamTextMock: vi.fn(),
}))

vi.mock('@xsai/stream-text', () => ({
  streamText: streamTextMock,
}))

vi.mock('@xsai/shared-chat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xsai/shared-chat')>()
  return {
    ...actual,
    stepCountAtLeast: vi.fn(),
  }
})

const provider: GenerationProvider = {
  generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://example.com/' } }),
}

it('reads edited model, prompt, provider and tools before a tool continuation request', async () => {
  const live = { model: 'model-a', prompt: 'First prompt', baseURL: 'https://first.example/', toolName: 'first_tool', temperature: 0.2 }
  const liveProvider: GenerationProvider = {
    generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: live.baseURL } }),
  }
  const snapshots: Array<{ model: string, prompt: string, baseURL: string, toolName?: string, temperature?: number }> = []
  const initialMessages: Message[] = [
    { role: 'system', content: 'First prompt' },
    { role: 'user', content: 'Use a tool' },
  ]
  const toolCall: Message = {
    role: 'assistant',
    content: '',
    tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'first_tool', arguments: '{}' } }],
  }
  const toolResult: Message = { role: 'tool', tool_call_id: 'call-1', content: 'done' }
  const finalMessages: Message[] = [...initialMessages, toolCall, toolResult, { role: 'assistant', content: 'Finished' }]
  const steps: CompletionStep[] = [
    { finishReason: 'tool-calls', toolCalls: [], toolResults: [] },
    { finishReason: 'stop', toolCalls: [], toolResults: [] },
  ]

  streamTextMock.mockImplementation((options: {
    model: string
    baseURL: string
    messages: Message[]
    temperature?: number
    tools?: Tool[]
    prepareStep: (step: { input: Message[], model: string, stepNumber: number, steps: CompletionStep[] }) => Promise<{ input?: Message[], model?: string }>
  }) => {
    const firstRequest = snapshots.length === 0
    const completion = (async () => {
      const first = await options.prepareStep({ input: structuredClone(options.messages), model: options.model, stepNumber: 0, steps: [] })
      snapshots.push({
        model: first.model ?? options.model,
        prompt: String(first.input?.find(message => message.role === 'system')?.content),
        baseURL: options.baseURL,
        toolName: options.tools?.[0]?.function.name,
        temperature: options.temperature,
      })

      if (!firstRequest)
        return [steps[1]]

      live.model = 'model-b'
      live.prompt = 'Edited prompt'
      live.baseURL = 'https://second.example/'
      live.toolName = 'second_tool'
      live.temperature = 0.7

      await options.prepareStep({ input: finalMessages.slice(0, -1), model: options.model, stepNumber: 1, steps: steps.slice(0, 1) })
      return [steps[0]]
    })()
    return {
      steps: completion,
      messages: completion.then(() => firstRequest ? finalMessages : [...options.messages, { role: 'assistant' as const, content: 'Finished' }]),
      usage: Promise.resolve(undefined),
      totalUsage: Promise.resolve(undefined),
    }
  })

  await streamFrom({
    model: live.model,
    chatProvider: liveProvider,
    conversation: { turns: chatMessagesToTurns(initialMessages) },
    options: {
      resolveStep: async () => ({
        model: live.model,
        chatProvider: liveProvider,
        providerId: 'live',
        systemPrompt: live.prompt,
        temperature: live.temperature,
        tools: [{
          type: 'function',
          function: { name: live.toolName, description: 'Current tool', parameters: { type: 'object', properties: {} } },
          execute: async () => 'done',
        }],
      }),
    },
  })

  expect(snapshots).toEqual([
    { model: 'model-a', prompt: 'First prompt', baseURL: 'https://first.example/', toolName: 'first_tool', temperature: 0.2 },
    { model: 'model-b', prompt: 'Edited prompt', baseURL: 'https://second.example/', toolName: 'second_tool', temperature: 0.7 },
  ])
})

// https://github.com/moeru-ai/airi/pull/2708
// ROOT CAUSE:
// The tool loop kept fields that the next provider omitted.
// Clear provider-owned fields before xsAI sends the next request.
it('clears provider credentials and request transport after a tool switches provider (PR #2708)', async () => {
  let useFirstProvider = true
  const firstFetch = vi.fn<typeof globalThis.fetch>()
  const chatProvider: GenerationProvider = {
    generation: model => ({
      protocol: 'chat-completions',
      config: useFirstProvider
        ? { model, baseURL: 'https://first.example/v1/', apiKey: 'first-secret', fetch: firstFetch }
        : { model, baseURL: 'https://second.example/v1/' },
    }),
  }
  const requests: Array<{ apiKey?: string, fetch?: typeof globalThis.fetch, headers?: HeadersInit }> = []
  streamTextMock.mockImplementation((options: {
    apiKey?: string
    fetch?: typeof globalThis.fetch
    headers?: HeadersInit
    prepareStep: (step: { input: Message[], steps: CompletionStep[] }) => Promise<unknown>
  }) => {
    const firstRequest = requests.length === 0
    const steps = (async () => {
      await options.prepareStep({ input: [{ role: 'user', content: 'test' }], steps: [] })
      requests.push({ apiKey: options.apiKey, fetch: options.fetch, headers: options.headers })
      if (firstRequest) {
        useFirstProvider = false
        await options.prepareStep({ input: [{ role: 'user', content: 'test' }], steps: [] })
      }
      return []
    })()
    return {
      steps,
      messages: steps.then(() => [{ role: 'user' as const, content: 'test' }]),
      usage: Promise.resolve(undefined),
      totalUsage: Promise.resolve(undefined),
    }
  })

  await streamFrom({
    model: 'test',
    chatProvider,
    conversation: { turns: [{ type: 'user', id: 'user', content: [{ type: 'text', text: 'test' }] }] },
    options: { resolveStep: async () => ({
      model: 'test',
      chatProvider,
      providerId: 'test',
      systemPrompt: '',
      headers: useFirstProvider ? { 'x-private-session': 'first-only' } : undefined,
    }) },
  })

  expect(requests).toEqual([
    { apiKey: 'first-secret', fetch: firstFetch, headers: { 'x-private-session': 'first-only' } },
    { apiKey: undefined, fetch: undefined, headers: {} },
  ])
})

function createMockStreamResult(
  steps: Promise<unknown[]> = Promise.resolve([]),
  totalUsage: Promise<{ inputTokens: number, outputTokens: number, totalTokens: number } | undefined> = Promise.resolve(undefined),
  messages: Promise<Message[]> = Promise.resolve([]),
) {
  const completedSteps: CompletionStep[] = []
  let settledMessages: Promise<Message[]> | undefined
  return {
    get steps() { return steps.then(original => completedSteps.length ? completedSteps : original) },
    get messages() {
      return settledMessages ??= messages.then(async (output) => {
        const options = streamTextMock.mock.lastCall?.[0]
        if (!options || output.length === 0)
          return output
        const input: Message[] = structuredClone(options.messages)
        const generated = output.slice(input.length)
        let step: Message[] = []
        function finishStep() {
          if (!step.length)
            return
          options.prepareStep?.({ input, model: options.model, stepNumber: 0, steps: [] })
          input.push(...step)
          const completion: CompletionStep = { finishReason: 'stop', toolCalls: [], toolResults: [] }
          completedSteps.push(completion)
          step = []
        }
        for (const entry of generated) {
          if (entry.role === 'assistant')
            finishStep()
          step.push(entry)
        }
        finishStep()
        return output
      })
    },
    usage: Promise.resolve(undefined),
    totalUsage,
  }
}

describe('streamFrom tool errors', () => {
  beforeEach(() => {
    streamTextMock.mockReset()
  })

  it('emits the final xsAI messages after all tool rounds finish', async () => {
    const onGeneratedTurn = vi.fn()
    const finalMessages: Message[] = [
      { role: 'user', content: 'Check the weather.' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call-weather',
            type: 'function',
            function: { name: 'weather', arguments: '{}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'call-weather', content: 'sunny' },
      { role: 'assistant', content: 'The weather is sunny.' },
    ]
    streamTextMock.mockReturnValueOnce(createMockStreamResult(
      Promise.resolve([]),
      Promise.resolve(undefined),
      Promise.resolve(finalMessages),
    ))

    await streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns(finalMessages.slice(0, 1)) },
      options: { onGeneratedTurn },
    })

    expect(onGeneratedTurn).toHaveBeenCalledTimes(1)
    expect(onGeneratedTurn.mock.calls[0][0].rounds).toHaveLength(2)
    expect(conversationToChatMessages({ turns: [onGeneratedTurn.mock.calls[0][0]] })).toEqual(finalMessages.slice(1))
  })

  it('ignores provider errors after steps resolve while final messages are pending', async () => {
    let onEvent: ((event: unknown) => Promise<void>) | undefined
    let resolveMessages: ((messages: Message[]) => void) | undefined
    const messages = new Promise<Message[]>((resolve) => {
      resolveMessages = resolve
    })

    streamTextMock.mockImplementationOnce((options: { onEvent: (event: unknown) => Promise<void> }) => {
      onEvent = options.onEvent
      return createMockStreamResult(Promise.resolve([]), Promise.resolve(undefined), messages)
    })

    // ROOT CAUSE:
    //
    // Final message persistence used to delay the steps-settled marker. A late
    // provider error could then reject a stream whose authoritative steps
    // promise had already resolved.
    //
    // We mark steps settled before awaiting the final generated turn, while still
    // treating generated turn persistence failures as real stream failures.
    const pending = streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([{ role: 'user', content: 'hello' }]) },
    })

    await vi.waitFor(() => expect(onEvent).toBeTypeOf('function'))
    await Promise.resolve()
    await onEvent!({ type: 'error', message: 'stream failed', cause: new Error('stream failed') })
    resolveMessages?.([])

    await expect(pending).resolves.toBeUndefined()
  })

  it('requests final streaming usage and emits the reported token totals once', async () => {
    const onUsage = vi.fn()
    streamTextMock.mockReturnValueOnce(createMockStreamResult(
      Promise.resolve([]),
      Promise.resolve({ inputTokens: 12, outputTokens: 8, totalTokens: 20 }),
    ))

    await streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([{ role: 'user', content: 'hello' }]) },
      options: { onUsage },
    })

    expect(streamTextMock).toHaveBeenCalledWith(expect.objectContaining({
      streamOptions: { includeUsage: true },
    }))
    expect(onUsage).toHaveBeenCalledTimes(1)
    expect(onUsage).toHaveBeenCalledWith({
      inputTokens: 12,
      outputTokens: 8,
      totalTokens: 20,
      source: 'reported',
    })
  })

  it('marks usage unavailable when the provider omits the final usage chunk', async () => {
    const onUsage = vi.fn()
    streamTextMock.mockReturnValueOnce(createMockStreamResult())

    await streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([{ role: 'user', content: 'hello' }]) },
      options: { onUsage },
    })

    expect(onUsage).toHaveBeenCalledWith({ source: 'unavailable' })
  })

  it('marks usage unavailable when the final usage object has no token fields', async () => {
    const onUsage = vi.fn()
    streamTextMock.mockReturnValueOnce(createMockStreamResult(
      Promise.resolve([]),
      Promise.resolve({} as { inputTokens: number, outputTokens: number, totalTokens: number }),
    ))

    await streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([{ role: 'user', content: 'hello' }]) },
      options: { onUsage },
    })

    expect(onUsage).toHaveBeenCalledWith({ source: 'unavailable' })
  })

  it('consumes totalUsage rejection when the stream fails before usage can be awaited', async () => {
    const streamError = new Error('provider stream failed')
    const totalUsageError = new Error('provider usage failed')
    const unhandledRejections: unknown[] = []
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason)
    }
    process.on('unhandledRejection', onUnhandledRejection)

    // Rejections begin when the SDK starts, after request preparation finishes.
    streamTextMock.mockImplementationOnce(() => createMockStreamResult(
      Promise.reject(streamError),
      Promise.reject(totalUsageError),
    ))

    try {
      await expect(streamFrom({
        model: 'model-a',
        chatProvider: provider,
        conversation: { turns: chatMessagesToTurns([{ role: 'user', content: 'hello' }]) },
      })).rejects.toThrow('provider stream failed')
      await new Promise(resolve => setImmediate(resolve))
      expect(unhandledRejections).toEqual([])
    }
    finally {
      process.off('unhandledRejection', onUnhandledRejection)
    }
  })

  it('does not fail a completed generation when the usage observer throws', async () => {
    streamTextMock.mockReturnValueOnce(createMockStreamResult())

    await expect(streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([{ role: 'user', content: 'hello' }]) },
      options: {
        onUsage: () => {
          throw new Error('analytics unavailable')
        },
      },
    })).resolves.toBeUndefined()
  })

  it('maps xsai tool-error results to AIRI tool-error events without wrapping tools', async () => {
    let resolveSteps: ((steps: unknown[]) => void) | undefined
    const events: unknown[] = []
    const failingTool = {
      type: 'function',
      function: {
        name: 'play_chess',
        description: 'Start chess.',
        parameters: { type: 'object', properties: {} },
      },
      execute: vi.fn(() => {
        throw new Error('Focus mode does not accept game-state mutation inputs.')
      }),
    } satisfies Tool

    streamTextMock.mockImplementationOnce((options: {
      onEvent: (event: unknown) => Promise<void>
      preToolCall?: unknown
      tools?: Tool[]
    }) => {
      const steps = new Promise<unknown[]>((resolve) => {
        resolveSteps = resolve
      })

      queueMicrotask(async () => {
        await options.onEvent({
          type: 'tool-result.done',
          args: {},
          isError: true,
          result: 'Tool "play_chess" execution failed: Focus mode does not accept game-state mutation inputs.',
          toolCallId: 'call-1',
          toolName: 'play_chess',
        })
        await options.onEvent({ type: 'text.delta', delta: 'ok' })
        resolveSteps?.([])
      })

      return createMockStreamResult(steps)
    })

    await streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([{ role: 'user', content: 'play chess' }]) },
      options: {
        tools: [failingTool],
        onStreamEvent: (event) => {
          events.push(event)
        },
      },
    })

    const streamOptions = streamTextMock.mock.calls[0]?.[0]
    expect(streamOptions.preToolCall).toBeUndefined()
    expect(streamOptions.tools?.[0]).toBe(failingTool)
    expect(failingTool.execute).not.toHaveBeenCalled()
    expect(events).toContainEqual({
      type: 'tool-error',
      isError: true,
      result: 'Tool "play_chess" execution failed: Focus mode does not accept game-state mutation inputs.',
      toolCallId: 'call-1',
    })
    expect(events).toContainEqual({ type: 'text-delta', text: 'ok' })
    expect(events).toContainEqual({ type: 'finish' })
  })

  it('rejects when the finish listener throws instead of leaving the stream pending', async () => {
    streamTextMock.mockReturnValueOnce(createMockStreamResult())

    await expect(streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([{ role: 'user', content: 'hello' }]) },
      options: {
        onStreamEvent: async (event) => {
          if (event.type === 'finish')
            throw new Error('finish listener failed')
        },
      },
    })).rejects.toThrow('finish listener failed')
  })
})

describe('chat protocol compatibility', () => {
  function projectChat(messages: Parameters<typeof chatMessagesToTurns>[0], supportsContentArray = true) {
    return conversationToChatMessages({ turns: chatMessagesToTurns(messages) }, supportsContentArray)
  }
  it('rewrites internal `error`-role messages as user-role narrations', () => {
    /**
     * @example
     * projectChat([{ role: 'error', content: 'Remote sent 400' }])
     * // -> [{ role: 'user', content: 'User encountered error: Remote sent 400' }]
     */
    const out = projectChat([{ role: 'error', content: 'Remote sent 400' }])
    expect(out).toEqual([
      { role: 'user', content: 'User encountered error: Remote sent 400' },
    ])
  })

  it('flattens text-only content arrays to a string by default', () => {
    /**
     * @example
     * projectChat([{
     *   role: 'user',
     *   content: [{ type: 'text', text: 'hi' }, { type: 'text', text: ' there' }],
     * }])
     * // -> [{ role: 'user', content: 'hi there' }]
     */
    const out = projectChat([{
      role: 'user',
      content: [
        { type: 'text', text: 'hi' },
        { type: 'text', text: ' there' },
      ],
    }])
    expect(out).toEqual([{ role: 'user', content: 'hi there' }])
  })

  it('preserves multimodal arrays when supportsContentArray is true (default)', () => {
    /**
     * @example
     * projectChat([{ role: 'user', content: [{type:'text',text:'see'},{type:'image_url',...}] }])
     * // -> unchanged: image_url part stays so vision-capable providers receive the image
     */
    const message: Message = {
      role: 'user',
      content: [
        { type: 'text', text: 'see this' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
      ],
    }
    const out = projectChat([message])
    expect(out[0]).toEqual(message)
  })

  // ROOT CAUSE:
  //
  // Some Rust/serde-based OpenAI-compatible gateways only deserialize
  // `messages[].content` as a plain string and reject content-part arrays
  // with HTTP 400 "Failed to deserialize the JSON body into the target type:
  // messages[N]: invalid type: sequence, expected a string". Before the fix,
  // historical messages that contained an `image_url` part (uploaded image,
  // vision capture, restored session) bypassed the existing flatten branch
  // and stayed as arrays, so every subsequent send re-tripped the 400.
  //
  // We fixed this by adding a `supportsContentArray` flag — when the runtime
  // auto-degrade has flipped it to `false`, we force-flatten arrays to a
  // text-only string and drop non-text parts so the request shape matches
  // what a string-only provider can deserialize.
  //
  // See: https://github.com/moeru-ai/airi/issues/1500
  it('issue #1500: drops image_url parts and flattens to string when supportsContentArray=false', () => {
    /**
     * @example
     * projectChat([{ role:'user', content: [{type:'text',text:'hi'},{type:'image_url',...}] }], false)
     * // -> [{ role: 'user', content: 'hi' }]
     */
    const out = projectChat([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'hi' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
        ],
      },
    ], false)
    expect(out).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('issue #1500: drops audio/file parts when supportsContentArray=false', () => {
    /**
     * @example
     * projectChat([{ role:'user', content: [{type:'text',text:'q'},{type:'input_audio',...},{type:'file',...}] }], false)
     * // -> [{ role: 'user', content: 'q' }]
     */
    const out = projectChat([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'q' },
          { type: 'input_audio', input_audio: { data: 'AAA', format: 'wav' } },
          { type: 'file', file: { file_id: 'f_1' } },
        ],
      },
    ], false)
    expect(out).toEqual([{ role: 'user', content: 'q' }])
  })

  it('passes string content through untouched regardless of the flag', () => {
    expect(projectChat([{ role: 'user', content: 'plain' }], true))
      .toEqual([{ role: 'user', content: 'plain' }])
    expect(projectChat([{ role: 'user', content: 'plain' }], false))
      .toEqual([{ role: 'user', content: 'plain' }])
  })
})

describe('isContentArrayRelatedError', () => {
  it('issue #1500: detects the Rust/serde "expected a string" wire error', () => {
    /**
     * @example
     * isContentArrayRelatedError(
     *   `Remote sent 400 response: {"error":{"message":"Failed to deserialize the JSON body into the target type: messages[7]: invalid type: sequence, expected a string at line 1 column 5603","code":"invalid_request_error"}}`
     * )
     * // -> true
     */
    const wire = 'Remote sent 400 response: {"error":{"message":"Failed to deserialize the JSON body into the target type: messages[7]: invalid type: sequence, expected a string at line 1 column 5603","type":"invalid_request_error","param":null,"code":"invalid_request_error"}}'
    expect(isContentArrayRelatedError(wire)).toBe(true)
    expect(isContentArrayRelatedError(new Error(wire))).toBe(true)
  })

  it('detects the Pydantic/Python "Input should be a valid string" variant', () => {
    /**
     * @example
     * isContentArrayRelatedError('messages.0.content: Input should be a valid string')
     * // -> true
     */
    expect(isContentArrayRelatedError('messages.0.content: Input should be a valid string'))
      .toBe(true)
    expect(isContentArrayRelatedError('messages.3.content expected string, got list'))
      .toBe(true)
  })

  it('does not false-positive on unrelated 400s', () => {
    expect(isContentArrayRelatedError('Remote sent 400 response: model not found')).toBe(false)
    expect(isContentArrayRelatedError('Remote sent 401 response: invalid api key')).toBe(false)
    expect(isContentArrayRelatedError('Tool call failed: invalid schema for function')).toBe(false)
    expect(isContentArrayRelatedError(undefined)).toBe(false)
  })
})

it('preserves native Chat reasoning for an unchanged turn and drops it on a model switch', async () => {
  const output: Message[] = [{ role: 'assistant', content: 'answer', reasoning_content: 'provider state' }]
  const context: Conversation = { turns: [] }
  streamTextMock.mockReturnValueOnce(createMockStreamResult(Promise.resolve([]), Promise.resolve(undefined), Promise.resolve(output)))
  await streamFrom({ model: 'test', chatProvider: provider, conversation: context, options: { onGeneratedTurn: (turn) => {
    context.turns.push(turn)
  } } })
  streamTextMock.mockReturnValueOnce(createMockStreamResult())
  await streamFrom({ model: 'test', chatProvider: provider, conversation: context })
  expect(streamTextMock.mock.lastCall?.[0].messages).toEqual(output)
  streamTextMock.mockReturnValueOnce(createMockStreamResult())
  await streamFrom({ model: 'another', chatProvider: provider, conversation: context })
  expect(streamTextMock.mock.lastCall?.[0].messages).toEqual([{ role: 'assistant', content: 'answer' }])
})

it('does not publish a generated turn when the terminal event consumer fails', async () => {
  const onGeneratedTurn = vi.fn()
  streamTextMock.mockReturnValueOnce(createMockStreamResult())
  await expect(streamFrom({
    model: 'test',
    chatProvider: provider,
    conversation: { turns: [] },
    options: {
      onGeneratedTurn,
      onStreamEvent: (event) => {
        if (event.type === 'finish')
          throw new Error('terminal consumer failed')
      },
    },
  })).rejects.toThrow('terminal consumer failed')
  expect(onGeneratedTurn).not.toHaveBeenCalled()
})
