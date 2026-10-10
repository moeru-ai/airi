import type { GenerationProvider } from '@proj-airi/provider-inference'
import type { CompletionStep, Event, Message, Tool } from '@xsai/shared-chat'

import type { Conversation } from '../messages/types'
import type { StreamOptions } from '../types/llm'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { chatMessagesToTurns, conversationToChatMessages } from '../messages/chat-completions'
import { isContentArrayRelatedError, isPlainTextToolCallError, streamFrom } from './llm-service'

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

function mockStreamEvents(events: unknown[]) {
  streamTextMock.mockImplementationOnce((options: { onEvent: (event: unknown) => void }) => {
    const steps = new Promise<unknown[]>((resolve) => {
      queueMicrotask(() => {
        for (const event of events)
          options.onEvent(event)
        resolve([])
      })
    })
    return createMockStreamResult(steps)
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

describe('streamFrom tool errors', () => {
  beforeEach(() => {
    streamTextMock.mockReset()
  })

  it('uses the supplied audio transcript before a string-only provider request', async () => {
    streamTextMock.mockReturnValueOnce(createMockStreamResult())
    const conversation: Conversation = { turns: [{ id: 'recording', type: 'user', content: [{ type: 'audio', format: 'wav', data: 'YXVkaW8=' }] }] }
    const project = vi.fn(async (): Promise<Conversation> => ({ turns: [{ id: 'recording', type: 'user', content: [{ type: 'text', text: 'Spoken request' }] }] }))
    await streamFrom({ model: 'text', chatProvider: provider, conversation, options: { supportsContentArray: false, prepareStringContent: project } })
    expect(project).toHaveBeenCalledOnce()
    expect(streamTextMock.mock.calls[0][0].messages).toEqual([{ role: 'user', content: 'Spoken request' }])
    expect(conversation.turns[0]).toMatchObject({ content: [{ type: 'audio', format: 'wav', data: 'YXVkaW8=' }] })
  })

  it('retains completed tools when a provider switch requires an audio text projection', async () => {
    let model = 'audio'
    const chatProvider: GenerationProvider = {
      generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: `https://${model}.example/` } }),
    }
    const conversation: Conversation = { turns: [{ id: 'recording', type: 'user', content: [{ type: 'audio', format: 'wav', data: 'YXVkaW8=' }] }] }
    const project = vi.fn(async (current: Conversation): Promise<Conversation> => {
      const projected = structuredClone(current)
      for (const turn of projected.turns) {
        if (turn.type === 'user')
          turn.content = turn.content.map(part => part.type === 'audio' ? { type: 'text', text: 'Spoken request' } : part)
      }
      return projected
    })
    const toolCall: Message = { role: 'assistant', content: '', tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'lookup', arguments: '{}' } }] }
    const toolResult: Message = { role: 'tool', tool_call_id: 'call-1', content: 'lookup result' }
    const requests: Message[][] = []
    streamTextMock.mockImplementation((options: {
      model: string
      messages: Message[]
      prepareStep: (step: { input: Message[], steps: CompletionStep[] }) => Promise<unknown>
    }) => {
      const first = requests.length === 0
      requests.push(structuredClone(options.messages))
      const steps = (async () => {
        await options.prepareStep({ input: structuredClone(options.messages), steps: [] })
        if (first) {
          model = 'text'
          await options.prepareStep({
            input: [...options.messages, toolCall, toolResult],
            steps: [{ finishReason: 'tool-calls', toolCalls: [], toolResults: [] }],
          })
        }
        return [{ finishReason: 'stop', toolCalls: [], toolResults: [] }]
      })()
      return {
        steps,
        messages: steps.then(() => [...options.messages, { role: 'assistant', content: 'Finished' }]),
        usage: Promise.resolve(undefined),
        totalUsage: Promise.resolve(undefined),
      }
    })
    await streamFrom({ model, chatProvider, conversation, options: {
      resolveStep: async () => ({ model, chatProvider, providerId: 'live', systemPrompt: '' }),
      contentArrayCompatibility: new Map([['https://text.example/-text', false]]),
      prepareStringContent: project,
    } })
    expect(project).toHaveBeenCalledOnce()
    expect(requests).toHaveLength(2)
    expect(requests[1]).toEqual([
      { role: 'user', content: 'Spoken request' },
      toolCall,
      toolResult,
    ])
    expect(conversation.turns).toHaveLength(1)
    expect(conversation.turns[0]).toMatchObject({ content: [{ type: 'audio' }] })
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

  // ROOT CAUSE:
  //
  // Explicit tool disabling removed a required choice and still called the provider.
  // Reject required choices without available tools before the provider request.
  it('rejects a required tool choice before the provider when tools are explicitly disabled', async () => {
    await expect(streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([{ role: 'user', content: 'Play the game.' }] as Message[]) },
      options: {
        supportsTools: false,
        toolChoice: {
          type: 'function',
          function: { name: 'builtIn_emitSparkCommand' },
        },
      },
    })).rejects.toThrow('Cannot satisfy a required tool choice because no tools are available')

    expect(streamTextMock).not.toHaveBeenCalled()
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

  // ROOT CAUSE:
  //
  // A slow output listener leaves an accepted error behind it in the queue.
  // Before the fix, stepsSettled made rejectOnce ignore that error.
  // The stream then saved partial messages and emitted finish.
  // Accepted errors now reject the queue even after provider completion.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3949844407
  it.each([false, true])('rejects an accepted error after steps resolve with tools=%s for Issue #2161', async (withTools) => {
    const steps = Promise.withResolvers<unknown[]>()
    const listenerStarted = Promise.withResolvers<void>()
    const releaseListener = Promise.withResolvers<void>()
    const streamError = new Error('accepted provider error')
    const onGeneratedTurn = vi.fn()
    const onUsage = vi.fn()
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
      return createMockStreamResult(steps.promise)
    })
    const result = streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([{ role: 'user', content: 'hello' }]) },
      options: { tools: withTools ? [createSparkTool()] : undefined, onStreamEvent, onGeneratedTurn, onUsage },
    }).then(() => undefined, error => error)

    await listenerStarted.promise
    steps.resolve([])
    await new Promise(resolve => setImmediate(resolve))
    releaseListener.resolve()

    expect(await result).toBe(streamError)
    expect(onStreamEvent.mock.calls.map(([event]) => event)).toEqual([
      { type: 'text-delta', text: 'partial answer' },
      { type: 'error', error: streamError },
    ])
    expect(onGeneratedTurn).not.toHaveBeenCalled()
    expect(onUsage).not.toHaveBeenCalled()
  })

  // ROOT CAUSE:
  //
  // A provider failure rejected while its output listener still changed session state.
  // Stop pending output and wait for the active listener before rejection.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3949844417
  it.each(['plain', 'step-end', 'native-tool'] as const)('stops %s output and drains the active listener on failure for Issue #2161', async (mode) => {
    const steps = Promise.withResolvers<unknown[]>()
    const listenerStarted = Promise.withResolvers<void>()
    const releaseListener = Promise.withResolvers<void>()
    const streamError = new Error('steps failed during output')
    const onGeneratedTurn = vi.fn()
    const onUsage = vi.fn()
    const mutations: string[] = []
    let settled = false
    const firstEvent = mode === 'plain'
      ? { type: 'text-delta', text: 'first' }
      : { type: 'reasoning-delta', text: '{"ordinary":1}' }
    const onStreamEvent = vi.fn<NonNullable<StreamOptions['onStreamEvent']>>(async () => {
      listenerStarted.resolve()
      await releaseListener.promise
      mutations.push(settled ? 'after rejection' : 'before rejection')
    })
    streamTextMock.mockImplementationOnce((options: { onEvent: (event: Event) => void }) => {
      if (mode === 'plain') {
        options.onEvent({ type: 'text.delta', delta: 'first' })
      }
      else {
        options.onEvent({ type: 'reasoning.delta', delta: '{"ordinary":1}' })
        options.onEvent({ type: 'text.delta', delta: 'buffered output' })
        options.onEvent(mode === 'step-end'
          ? { type: 'step.done', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }
          : { type: 'tool-call.done', toolCallId: 'call-1', toolCallType: 'function', toolName: 'builtIn_emitSparkCommand', args: '{}' })
        // Native events no longer release JSON. End the step to start its flush.
        if (mode === 'native-tool')
          options.onEvent({ type: 'step.done', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } })
      }
      options.onEvent({ type: 'text.delta', delta: 'queued output' })
      return createMockStreamResult(steps.promise)
    })
    const result = streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([{ role: 'user', content: 'hello' }]) },
      options: { tools: [createSparkTool()], onStreamEvent, onGeneratedTurn, onUsage },
    }).then(
      () => {
        settled = true
      },
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
    expect(onStreamEvent.mock.calls.map(([event]) => event)).toEqual([firstEvent])
    expect(onGeneratedTurn).not.toHaveBeenCalled()
    expect(onUsage).not.toHaveBeenCalled()
  })

  it('drains accepted output but ignores new provider events after steps resolve', async () => {
    const steps = Promise.withResolvers<unknown[]>()
    const listenerStarted = Promise.withResolvers<void>()
    const releaseListener = Promise.withResolvers<void>()
    let onEvent: (event: Event) => void = () => {
      throw new Error('provider not started')
    }
    const onGeneratedTurn = vi.fn()
    const onStreamEvent = vi.fn<NonNullable<StreamOptions['onStreamEvent']>>(async (event) => {
      if (event.type === 'text-delta') {
        listenerStarted.resolve()
        await releaseListener.promise
      }
    })
    streamTextMock.mockImplementationOnce((options: { onEvent: typeof onEvent }) => {
      onEvent = options.onEvent
      onEvent({ type: 'text.delta', delta: 'accepted output' })
      return createMockStreamResult(steps.promise)
    })
    const pending = streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([{ role: 'user', content: 'hello' }]) },
      options: { onStreamEvent, onGeneratedTurn },
    })
    await listenerStarted.promise
    steps.resolve([])
    await new Promise(resolve => setImmediate(resolve))
    onEvent({ type: 'error', message: 'late provider error' })
    onEvent({ type: 'text.delta', delta: 'late output' })
    expect(onGeneratedTurn).not.toHaveBeenCalled()
    releaseListener.resolve()
    await pending

    expect(onStreamEvent.mock.calls.map(([event]) => event)).toEqual([
      { type: 'text-delta', text: 'accepted output' },
      { type: 'finish' },
    ])
    expect(onGeneratedTurn).toHaveBeenCalledTimes(1)
  })

  it.each([false, true])('stops the queue when an output listener rejects with steps complete=%s', async (stepsComplete) => {
    const steps = Promise.withResolvers<unknown[]>()
    const listenerStarted = Promise.withResolvers<void>()
    const releaseListener = Promise.withResolvers<void>()
    const listenerError = new Error('output listener failed')
    const onGeneratedTurn = vi.fn()
    const onStreamEvent = vi.fn<NonNullable<StreamOptions['onStreamEvent']>>(async () => {
      listenerStarted.resolve()
      await releaseListener.promise
      throw listenerError
    })
    streamTextMock.mockImplementationOnce((options: { onEvent: (event: Event) => void }) => {
      options.onEvent({ type: 'text.delta', delta: 'first' })
      options.onEvent({ type: 'text.delta', delta: 'second' })
      return createMockStreamResult(steps.promise)
    })
    const result = streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([]) },
      options: { onStreamEvent, onGeneratedTurn },
    }).then(() => undefined, error => error)

    await listenerStarted.promise
    if (stepsComplete)
      steps.resolve([])
    await new Promise(resolve => setImmediate(resolve))
    releaseListener.resolve()
    try {
      expect(await result).toBe(listenerError)
    }
    finally {
      steps.resolve([])
    }
    await new Promise(resolve => setImmediate(resolve))
    expect(onStreamEvent).toHaveBeenCalledTimes(1)
    expect(onGeneratedTurn).not.toHaveBeenCalled()
  })

  it('keeps the provider failure when the active listener also rejects', async () => {
    const steps = Promise.withResolvers<unknown[]>()
    const listenerStarted = Promise.withResolvers<void>()
    const releaseListener = Promise.withResolvers<void>()
    const streamError = new Error('provider failed first')
    const onStreamEvent = vi.fn<NonNullable<StreamOptions['onStreamEvent']>>(async () => {
      listenerStarted.resolve()
      await releaseListener.promise
      throw new Error('listener failed later')
    })
    streamTextMock.mockImplementationOnce((options: { onEvent: (event: Event) => void }) => {
      options.onEvent({ type: 'text.delta', delta: 'first' })
      options.onEvent({ type: 'text.delta', delta: 'second' })
      return createMockStreamResult(steps.promise)
    })
    const result = streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([]) },
      options: { onStreamEvent },
    }).then(() => undefined, error => error)
    await listenerStarted.promise
    steps.reject(streamError)
    await new Promise(resolve => setImmediate(resolve))
    releaseListener.resolve()

    expect(await result).toBe(streamError)
    expect(onStreamEvent).toHaveBeenCalledTimes(1)
  })

  // ROOT CAUSE:
  //
  // Before the fix, an error rejected the caller but left queued output and success callbacks active.
  // Failure now stops both paths even if the provider later resolves its steps.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3949844407
  it('rejects an accepted error before steps complete without later success callbacks for Issue #2161', async () => {
    const steps = Promise.withResolvers<unknown[]>()
    const streamError = new Error('provider event failed')
    const onStreamEvent = vi.fn()
    const onGeneratedTurn = vi.fn()
    const onUsage = vi.fn()
    streamTextMock.mockImplementationOnce((options: { onEvent: (event: Event) => void }) => {
      options.onEvent({ type: 'error', message: streamError.message, cause: streamError })
      options.onEvent({ type: 'text.delta', delta: 'must not escape' })
      return createMockStreamResult(steps.promise)
    })
    await expect(streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([]) },
      options: { onStreamEvent, onGeneratedTurn, onUsage },
    })).rejects.toBe(streamError)
    steps.resolve([])
    await new Promise(resolve => setImmediate(resolve))

    expect(onStreamEvent.mock.calls.map(([event]) => event)).toEqual([{ type: 'error', error: streamError }])
    expect(onGeneratedTurn).not.toHaveBeenCalled()
    expect(onUsage).not.toHaveBeenCalled()
  })

  it.each(['messages', 'listener'] as const)('rejects final transcript failures from %s without usage reporting', async (failureSource) => {
    const persistenceError = new Error('transcript failed')
    const onStreamEvent = vi.fn()
    const onUsage = vi.fn()
    const onGeneratedTurn = vi.fn(() => {
      throw persistenceError
    })
    streamTextMock.mockReturnValueOnce(createMockStreamResult(
      Promise.resolve([]),
      Promise.resolve(undefined),
      failureSource === 'messages' ? Promise.reject(persistenceError) : Promise.resolve([]),
    ))
    await expect(streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([]) },
      options: { onGeneratedTurn, onStreamEvent, onUsage },
    })).rejects.toBe(persistenceError)

    expect(onGeneratedTurn).toHaveBeenCalledTimes(failureSource === 'messages' ? 0 : 1)
    expect(onStreamEvent.mock.calls.map(([event]) => event)).toEqual(failureSource === 'messages' ? [] : [{ type: 'finish' }])
    expect(onUsage).not.toHaveBeenCalled()
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

  // ROOT CAUSE:
  // Native tool events released buffered JSON and disabled the guard mid-step.
  // The guard must inspect the full step, including candidates across native events.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3950440962
  it.each(['text.delta', 'reasoning.delta'] as const)('guards %s around native tool events for Issue #2161', async (type) => {
    const call = '{"name":"builtIn_emitSparkCommand","arguments":{}}'
    const nativeEvents: Event[] = [
      { type: 'tool-call.start', toolCallId: 'call-1', toolName: 'builtIn_emitSparkCommand' },
      { type: 'tool-call.delta', delta: '{}' },
      { type: 'tool-call.done', toolCallId: 'call-1', toolName: 'builtIn_emitSparkCommand', toolCallType: 'function', args: '{}' },
    ]
    for (const nativeEvent of nativeEvents) {
      for (const splitAt of [0, 20, call.length]) {
        const onStreamEvent = vi.fn()
        const onGeneratedTurn = vi.fn()
        const events: Event[] = [
          { type, delta: call.slice(0, splitAt) },
          nativeEvent,
          { type, delta: call.slice(splitAt) },
        ]
        mockStreamEvents(events)
        await expect(streamFrom({
          model: 'model-a',
          chatProvider: provider,
          conversation: { turns: chatMessagesToTurns([]) },
          options: { tools: [createSparkTool()], onStreamEvent, onGeneratedTurn },
        })).rejects.toThrow('tool call "builtIn_emitSparkCommand" as plain text')
        expect(onStreamEvent.mock.calls.flat()).not.toContainEqual(expect.objectContaining({ type: type === 'text.delta' ? 'text-delta' : 'reasoning-delta' }))
        expect(onGeneratedTurn).not.toHaveBeenCalled()
        expect(onStreamEvent).not.toHaveBeenCalledWith({ type: 'finish' })
      }
    }
  })

  // ROOT CAUSE:
  // A native event can split a valid outer object before its closing brace.
  // Inspect at step completion so its nested example remains ordinary JSON.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3950440962
  it('preserves nested JSON and native event order for Issue #2161', async () => {
    const first = '{"example":{"name":"builtIn_emitSparkCommand","arguments":{}}'
    const events: Event[] = [
      { type: 'reasoning.delta', delta: first },
      { type: 'tool-call.start', toolCallId: 'call-1', toolName: 'builtIn_emitSparkCommand' },
      { type: 'tool-call.done', toolCallId: 'call-1', toolName: 'builtIn_emitSparkCommand', toolCallType: 'function', args: '{}' },
      { type: 'reasoning.delta', delta: '}' },
      { type: 'tool-result.done', toolCallId: 'call-1', toolName: 'builtIn_emitSparkCommand', args: {}, result: 'ok', isError: false },
      { type: 'text.delta', delta: 'Done.' },
    ]
    mockStreamEvents(events)
    const onStreamEvent = vi.fn()
    await streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([]) },
      options: { tools: [createSparkTool()], onStreamEvent },
    })
    expect(onStreamEvent.mock.calls.map(([event]) => event)).toEqual([
      { type: 'reasoning-delta', text: first },
      expect.objectContaining({ type: 'tool-call', toolCallId: 'call-1' }),
      { type: 'reasoning-delta', text: '}' },
      { type: 'tool-result', toolCallId: 'call-1', result: 'ok' },
      { type: 'text-delta', text: 'Done.' },
      { type: 'finish' },
    ])
  })

  // ROOT CAUSE:
  //
  // Some providers returned tool calls as text, which reached the UI.
  // Reject complete calls for known tools in either output channel.
  // Ordinary reasoning streams before candidates, so callers must not replay it.
  // https://github.com/moeru-ai/airi/issues/2161
  it('rejects a known plain-text tool call after ordinary reasoning for Issue #2161', async () => {
    const events: unknown[] = []
    const rawToolCall = JSON.stringify({
      name: 'builtIn_emitSparkCommand',
      parameters: {
        destinations: [],
        guidance: 'x'.repeat(70 * 1024),
      },
    })
    mockStreamEvents([
      { type: 'step.start' },
      { type: 'reasoning.delta', delta: 'I should call the game tool.' },
      { type: 'text.delta', delta: rawToolCall },
      { type: 'step.done', usage: {} },
    ])

    const error = await streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([{ role: 'user', content: 'Can you play games?' }] as Message[]) },
      options: {
        tools: [createSparkTool()],
        onStreamEvent: (event) => {
          events.push(event)
        },
      },
    }).then(
      () => undefined,
      error => error,
    )

    expect(error).toBeInstanceOf(Error)
    expect(String(error)).toContain('tool call "builtIn_emitSparkCommand" as plain text')
    expect(isPlainTextToolCallError(error)).toBe(true)
    expect(isPlainTextToolCallError(new Error('A provider mentioned a tool call as plain text.'))).toBe(false)
    expect(events).toContainEqual({ type: 'reasoning-delta', text: 'I should call the game tool.' })
    expect(events).not.toContainEqual({ type: 'text-delta', text: rawToolCall })
    expect(events).not.toContainEqual({ type: 'finish' })
  })

  // ROOT CAUSE:
  //
  // Reasoning was buffered without inspection, then released at step boundaries.
  // Track text and reasoning candidates separately and reject known calls in either channel.
  // https://github.com/moeru-ai/airi/issues/2161
  it('rejects a known plain-text tool call emitted only through reasoning for Issue #2161', async () => {
    const rawToolCall = JSON.stringify({
      name: 'builtIn_emitSparkCommand',
      parameters: { destinations: [] },
    })
    const expectRejectedReasoningCall = async (trailingEvents: unknown[]) => {
      const events: unknown[] = []

      mockStreamEvents([
        { type: 'step.start' },
        { type: 'reasoning.delta', delta: rawToolCall },
        ...trailingEvents,
        { type: 'step.done', usage: {} },
      ])

      const error = await streamFrom({
        model: 'model-a',
        chatProvider: provider,
        conversation: { turns: chatMessagesToTurns([{ role: 'user', content: 'Can you play games?' }] as Message[]) },
        options: {
          tools: [createSparkTool()],
          onStreamEvent: (event) => {
            events.push(event)
          },
        },
      }).then(
        () => undefined,
        error => error,
      )

      expect(error).toBeInstanceOf(Error)
      expect(String(error)).toContain('tool call "builtIn_emitSparkCommand" as plain text')
      expect(isPlainTextToolCallError(error)).toBe(true)
      expect(events).not.toContainEqual({ type: 'reasoning-delta', text: rawToolCall })
      expect(events).not.toContainEqual({ type: 'finish' })
    }

    await expectRejectedReasoningCall([])
    await expectRejectedReasoningCall([
      { type: 'text.delta', delta: 'I cannot play that game.' },
    ])
    expect(streamTextMock).toHaveBeenCalledTimes(2)
  })

  // ROOT CAUSE:
  //
  // A text prefix disabled the guard for the rest of the model step.
  // Before the fix, a later tool JSON reached the caller as normal output.
  // We keep the guard active and inspect complete JSON objects after prefixes.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3932132863
  it.each([
    ['text.delta', 'I will call the game tool.\n'],
    ['text.delta', '```json\n'],
    ['text.delta', '{not JSON}\n{"status":"ready"}\n'],
    ['reasoning.delta', 'I will call the game tool.\n'],
    ['reasoning.delta', '```json\n'],
  ])('rejects a prefixed tool JSON in %s with prefix %j for Issue #2161', async (type, prefix) => {
    const rawToolCall = JSON.stringify({
      name: 'builtIn_emitSparkCommand',
      parameters: { guidance: 'Use {braces}, a "quote", and a \\ slash.' },
    })
    const onStreamEvent = vi.fn()
    const onGeneratedTurn = vi.fn()
    mockStreamEvents([
      { type: 'step.start' },
      { type, delta: prefix },
      ...Array.from(rawToolCall, delta => ({ type, delta })),
      { type, delta: '\n```\nDone.' },
      { type: 'step.done', usage: {} },
    ])

    await expect(streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([{ role: 'user', content: 'Can you play games?' }]) },
      options: { tools: [createSparkTool()], onStreamEvent, onGeneratedTurn },
    })).rejects.toThrow('tool call "builtIn_emitSparkCommand" as plain text')

    const output = onStreamEvent.mock.calls.map(([event]) => event.text ?? '').join('')
    expect(output).not.toContain('{')
    expect(onStreamEvent).not.toHaveBeenCalledWith({ type: 'finish' })
    expect(onGeneratedTurn).not.toHaveBeenCalled()
  })

  // ROOT CAUSE:
  //
  // A prose prefix and its tool JSON can arrive in the same provider chunk.
  // Before the fix, the prefix made the whole chunk bypass JSON detection.
  // We inspect complete objects regardless of the provider chunk boundaries.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3932132863
  it('rejects a prefix and tool JSON in one chunk for Issue #2161', async () => {
    const onStreamEvent = vi.fn()
    mockStreamEvents([{
      type: 'text.delta',
      delta: 'Here is the call: ```json\n{"name":"builtIn_emitSparkCommand","arguments":{}}\n```',
    }])

    await expect(streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([]) },
      options: { tools: [createSparkTool()], onStreamEvent },
    })).rejects.toThrow('tool call "builtIn_emitSparkCommand" as plain text')

    expect(onStreamEvent).not.toHaveBeenCalled()
  })

  // ROOT CAUSE:
  //
  // An unmatched opening brace kept the first candidate open for the whole step.
  // Before the fix, a later complete tool call remained inside that invalid candidate.
  // We inspect later objects independently, but skip children of valid JSON objects.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3949439841
  it.each([
    ['text.delta', 'Use {value here.\n'],
    ['reasoning.delta', 'Use {value here.\n'],
    ['text.delta', '{{{'],
    ['reasoning.delta', '{{{'],
    ['text.delta', '{"unfinished":"prefix '],
    ['reasoning.delta', '{"unfinished":"prefix '],
    ['text.delta', '{invalid: '],
    ['reasoning.delta', '{invalid: '],
  ])('rejects a tool JSON in %s after malformed prefix %j for Issue #2161', async (type, prefix) => {
    const rawToolCall = '{"name":"builtIn_emitSparkCommand","arguments":{"text":"A } brace and a { brace."}}'
    const onStreamEvent = vi.fn()
    const onGeneratedTurn = vi.fn()
    mockStreamEvents([
      { type, delta: prefix },
      ...Array.from(rawToolCall, delta => ({ type, delta })),
    ])

    await expect(streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([]) },
      options: { tools: [createSparkTool()], onStreamEvent, onGeneratedTurn },
    })).rejects.toThrow('tool call "builtIn_emitSparkCommand" as plain text')

    expect(onStreamEvent).not.toHaveBeenCalled()
    expect(onGeneratedTurn).not.toHaveBeenCalled()
  })

  it.each([
    'A plain answer without JSON.',
    'Use {score} for the value. Then {not JSON}.',
    '```json\n{"name":"Airi","parameters":{}}\n```',
    'Result: {"name":"builtIn_emitSparkCommand","description":"A tool name without a call."}',
    'Result: {"example":{"name":"builtIn_emitSparkCommand","parameters":{}}}',
    'Result: {"text":"A brace } and an escaped quote \\" followed by {"}',
    'An incomplete object: {"name":"builtIn_emitSparkCommand",',
    'Malformed { prefix, then {"example":{"name":"builtIn_emitSparkCommand","parameters":{}}}',
    JSON.stringify({ text: '{"name":"builtIn_emitSparkCommand","parameters":{}}', escaped: '\\"{}\\' }),
  ])('preserves ordinary output %j after inspecting JSON candidates', async (answer) => {
    const onStreamEvent = vi.fn()
    mockStreamEvents(Array.from(answer, delta => ({ type: 'text.delta', delta })))

    await streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([]) },
      options: { tools: [createSparkTool()], onStreamEvent },
    })

    expect(onStreamEvent.mock.calls.map(([event]) => event.text ?? '').join('')).toBe(answer)
    expect(onStreamEvent).toHaveBeenCalledWith({ type: 'finish' })
  })

  // ROOT CAUSE:
  //
  // A malformed enclosing object hid a complete tool call even with balanced braces.
  // We skip nested candidates only after JSON.parse accepts their enclosing object.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3949439841
  it.each([
    '{{"name":"builtIn_emitSparkCommand","arguments":{}}}',
    `${'{'.repeat(20_000)}{"name":"builtIn_emitSparkCommand","arguments":{}}`,
  ])('recovers from malformed enclosing braces for Issue #2161 %#', async (answer) => {
    const onStreamEvent = vi.fn()
    mockStreamEvents([{ type: 'text.delta', delta: answer }])

    await expect(streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([]) },
      options: { tools: [createSparkTool()], onStreamEvent },
    })).rejects.toThrow('tool call "builtIn_emitSparkCommand" as plain text')

    expect(onStreamEvent).not.toHaveBeenCalled()
  })

  // ROOT CAUSE:
  //
  // Balanced but invalid nested objects caused JSON.parse to scan overlapping suffixes.
  // The guard now limits total parse work and rejects before it releases unchecked output.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3953824377
  it.each(['text.delta', 'reasoning.delta'] as const)('bounds invalid nested JSON in %s for Issue #2161', async (type) => {
    const answer = `${'{"a":'.repeat(512)}x${'}'.repeat(512)}`
    const onStreamEvent = vi.fn()
    const onGeneratedTurn = vi.fn()
    const onUsage = vi.fn()
    mockStreamEvents([{ type, delta: answer }, { type: 'step.done' }])

    await expect(streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([]) },
      options: { tools: [createSparkTool()], onStreamEvent, onGeneratedTurn, onUsage },
    })).rejects.toThrow('Model output exceeded the JSON inspection work limit.')

    expect(onStreamEvent).not.toHaveBeenCalled()
    expect(onGeneratedTurn).not.toHaveBeenCalled()
    expect(onUsage).not.toHaveBeenCalled()
  })

  // ROOT CAUSE:
  //
  // Exhausted inspection must not release later unchecked tool calls.
  // Exhaustion rejects the whole buffer, including output in the other channel.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3953824377
  it.each(['text.delta', 'reasoning.delta'] as const)('withholds later tool JSON after the work limit in %s for Issue #2161', async (type) => {
    const answer = `${'{"a":'.repeat(512)}x${'}'.repeat(512)}`
    const onStreamEvent = vi.fn()
    const onGeneratedTurn = vi.fn()
    mockStreamEvents([
      { type, delta: answer },
      { type, delta: '{"name":"builtIn_emitSparkCommand","arguments":{}}' },
      { type: type === 'text.delta' ? 'reasoning.delta' : 'text.delta', delta: 'Also buffered.' },
    ])

    await expect(streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([]) },
      options: { tools: [createSparkTool()], onStreamEvent, onGeneratedTurn },
    })).rejects.toThrow('Model output exceeded the JSON inspection work limit.')

    expect(onStreamEvent).not.toHaveBeenCalled()
    expect(onGeneratedTurn).not.toHaveBeenCalled()
  })

  // ROOT CAUSE:
  //
  // Size, depth, and candidate-count limits reject some output that takes linear work.
  // The budget counts candidate lengths and resets for each channel and step.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3953824377
  it.each([
    ['deep valid JSON', `${'{"a":'.repeat(20_000)}{"name":"builtIn_emitSparkCommand","arguments":{}}${'}'.repeat(20_000)}`],
    ['separate invalid candidates', '{"a":x} '.repeat(2000)],
    ['nested candidates near the budget', `${'{"a":'.repeat(14)}x${'}'.repeat(14)}`],
  ])('preserves %s across channels and steps for Issue #2161', async (_, answer) => {
    const onStreamEvent = vi.fn()
    mockStreamEvents([
      { type: 'text.delta', delta: answer },
      { type: 'reasoning.delta', delta: answer },
      { type: 'step.done' },
      { type: 'step.start' },
      { type: 'text.delta', delta: answer },
    ])

    await streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([]) },
      options: { tools: [createSparkTool()], onStreamEvent },
    })

    expect(onStreamEvent.mock.calls.map(([event]) => event)).toEqual([
      { type: 'text-delta', text: answer },
      { type: 'reasoning-delta', text: answer },
      { type: 'text-delta', text: answer },
      { type: 'finish' },
    ])
  })

  // ROOT CAUSE:
  // Step completion released incomplete JSON, but consumers joined text across steps.
  // Keep unmatched candidates until stream completion and inspect each channel as a whole.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3954079834
  it.each(['text.delta', 'reasoning.delta'] as const)('guards every cross-step split in %s for Issue #2161', async (type) => {
    const call = JSON.stringify({ name: 'builtIn_emitSparkCommand', arguments: { text: 'a\\"}b', nested: { value: 1 } } })
    for (const boundary of [['step.done'], ['step.start'], ['step.done', 'step.start']]) {
      for (let cut = 1; cut < call.length; cut++) {
        const onStreamEvent = vi.fn()
        const onGeneratedTurn = vi.fn()
        mockStreamEvents([
          { type, delta: call.slice(0, cut) },
          ...boundary.map(type => ({ type })),
          { type, delta: call.slice(cut) },
        ])
        await expect(streamFrom({
          model: 'model-a',
          chatProvider: provider,
          conversation: { turns: chatMessagesToTurns([]) },
          options: { tools: [createSparkTool()], onStreamEvent, onGeneratedTurn },
        })).rejects.toThrow('as plain text')
        expect(onStreamEvent).not.toHaveBeenCalled()
        expect(onGeneratedTurn).not.toHaveBeenCalled()
      }
    }
  })

  // ROOT CAUSE:
  // An unfinished outer example can contain a complete inner tool-shaped object.
  // Wait for the outer object before deciding whether its children are calls.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3954079834
  it.each(['text.delta', 'reasoning.delta'] as const)('preserves cross-step examples in %s for Issue #2161', async (type) => {
    const call = '{"name":"builtIn_emitSparkCommand","arguments":{}}'
    for (const answer of [`{"example":${call}}`, JSON.stringify({ text: call, escape: '\\"{}' }), '{"ordinary":1}']) {
      for (let cut = 1; cut < answer.length; cut++) {
        const onStreamEvent = vi.fn()
        mockStreamEvents([
          { type, delta: answer.slice(0, cut) },
          { type: 'step.done' },
          { type: 'step.start' },
          { type, delta: answer.slice(cut) },
        ])
        await streamFrom({
          model: 'model-a',
          chatProvider: provider,
          conversation: { turns: chatMessagesToTurns([]) },
          options: { tools: [createSparkTool()], onStreamEvent },
        })
        expect(onStreamEvent.mock.calls.map(([event]) => event.text ?? '').join('')).toBe(answer)
        expect(onStreamEvent).toHaveBeenCalledWith({ type: 'finish' })
      }
    }
  })

  // ROOT CAUSE:
  // A step boundary is not final output. Partial candidates must retain event order.
  // Native activity still reaches the retry owner before buffered UI callbacks.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3954079834
  it.each([false, true])('holds partial output until stream settlement, failure=%s, for Issue #2161', async (fail) => {
    const steps = Promise.withResolvers<unknown[]>()
    const onStreamEvent = vi.fn()
    const onGeneratedTurn = vi.fn()
    const onUsage = vi.fn()
    const onNativeToolCall = vi.fn()
    const failure = new Error('provider failed after a partial candidate')
    streamTextMock.mockImplementationOnce((options: { onEvent: (event: unknown) => void }) => {
      queueMicrotask(() => {
        options.onEvent({ type: 'text.delta', delta: '{"ordinary":' })
        options.onEvent({ type: 'step.done' })
        options.onEvent({ type: 'tool-call.done', toolCallId: 'call-1', toolName: 'builtIn_emitSparkCommand', toolCallType: 'function', args: '{}' })
        options.onEvent({ type: 'step.start' })
        options.onEvent({ type: 'reasoning.delta', delta: 'Still working.' })
      })
      return createMockStreamResult(steps.promise)
    })
    const pending = streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([]) },
      onNativeToolCall,
      options: { tools: [createSparkTool()], onStreamEvent, onGeneratedTurn, onUsage },
    }).then(() => undefined, error => error)
    await new Promise(resolve => setImmediate(resolve))
    expect(onNativeToolCall).toHaveBeenCalledTimes(1)
    expect(onStreamEvent).not.toHaveBeenCalled()
    expect(onGeneratedTurn).not.toHaveBeenCalled()
    if (fail)
      steps.reject(failure)
    else
      steps.resolve([])
    const outcome = await pending
    if (fail) {
      expect(outcome).toBe(failure)
      expect(onStreamEvent).not.toHaveBeenCalled()
      expect(onGeneratedTurn).not.toHaveBeenCalled()
      expect(onUsage).not.toHaveBeenCalled()
    }
    else {
      expect(outcome).toBeUndefined()
      expect(onStreamEvent.mock.calls.map(([event]) => event)).toEqual([
        { type: 'text-delta', text: '{"ordinary":' },
        expect.objectContaining({ type: 'tool-call', toolCallId: 'call-1' }),
        { type: 'reasoning-delta', text: 'Still working.' },
        { type: 'finish' },
      ])
      expect(onGeneratedTurn).toHaveBeenCalledTimes(1)
      expect(onUsage).toHaveBeenCalledTimes(1)
    }
  })

  // ROOT CAUSE:
  // Cross-step retention must not remove the parse-work limit or merge channels.
  // Inspect deferred buffers once at completion, with each channel kept separate.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3954079834
  it.each(['text.delta', 'reasoning.delta'] as const)('bounds deferred parsing in %s for Issue #2161', async (type) => {
    const onStreamEvent = vi.fn()
    mockStreamEvents([
      ...Array.from({ length: 10 }, () => [
        { type, delta: '{"a":'.repeat(2000) },
        { type: 'step.done' },
        { type: 'step.start' },
      ]).flat(),
      { type, delta: `x${'}'.repeat(20_000)}` },
    ])
    await expect(streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([]) },
      options: { tools: [createSparkTool()], onStreamEvent },
    })).rejects.toThrow('JSON inspection work limit')
    expect(onStreamEvent).not.toHaveBeenCalled()
  })

  // ROOT CAUSE:
  // Consumers join steps within each channel, not text with reasoning.
  // A partial candidate must not combine with the other channel or another request.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3954079834
  it('isolates retained candidates across channels and requests for Issue #2161', async () => {
    const prefix = '{"name":"builtIn_emitSparkCommand",'
    const suffix = '"arguments":{}}'
    const onStreamEvent = vi.fn()
    mockStreamEvents([
      { type: 'text.delta', delta: prefix },
      { type: 'step.done' },
      { type: 'step.start' },
      { type: 'reasoning.delta', delta: suffix },
    ])
    await streamFrom({ model: 'model-a', chatProvider: provider, conversation: { turns: chatMessagesToTurns([]) }, options: { tools: [createSparkTool()], onStreamEvent } })
    expect(onStreamEvent.mock.calls.map(([event]) => event)).toEqual([
      { type: 'text-delta', text: prefix },
      { type: 'reasoning-delta', text: suffix },
      { type: 'finish' },
    ])
    onStreamEvent.mockClear()
    mockStreamEvents([{ type: 'text.delta', delta: suffix }])
    await streamFrom({ model: 'model-a', chatProvider: provider, conversation: { turns: chatMessagesToTurns([]) }, options: { tools: [createSparkTool()], onStreamEvent } })
    expect(onStreamEvent.mock.calls.map(([event]) => event)).toEqual([
      { type: 'text-delta', text: suffix },
      { type: 'finish' },
    ])
  })

  // ROOT CAUSE:
  //
  // The reasoning path buffered every delta while tools were available.
  // Before the fix, ordinary reasoning stayed hidden until another event flushed it.
  // We stream reasoning until either output channel starts a JSON candidate.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3949439849
  it.each([
    ['text.delta', 'text-delta', 'Hello', ' there.'],
    ['reasoning.delta', 'reasoning-delta', 'Let me think.', ' I can explain.'],
  ] as const)('streams %s before step completion for Issue #2161', async (type, outputType, first, second) => {
    let emit: ((event: unknown) => void) | undefined
    let finish: ((steps: unknown[]) => void) | undefined
    const onStreamEvent = vi.fn()
    streamTextMock.mockImplementationOnce((options: { onEvent: (event: unknown) => void }) => {
      emit = options.onEvent
      return createMockStreamResult(new Promise((resolve) => {
        finish = resolve
      }))
    })
    const pending = streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([]) },
      options: { tools: [createSparkTool()], onStreamEvent },
    })

    try {
      await vi.waitFor(() => expect(emit).toBeTypeOf('function'))
      emit!({ type, delta: first })
      await vi.waitFor(() => expect(onStreamEvent).toHaveBeenCalledWith({ type: outputType, text: first }))
      emit!({ type, delta: second })
      await vi.waitFor(() => expect(onStreamEvent).toHaveBeenCalledWith({ type: outputType, text: second }))
      expect(onStreamEvent).not.toHaveBeenCalledWith({ type: 'finish' })
    }
    finally {
      finish?.([])
      await pending
    }
    expect(onStreamEvent).toHaveBeenCalledWith({ type: 'finish' })
  })

  // ROOT CAUSE:
  //
  // Assistant text can arrive between chunks of a reasoning JSON object.
  // Before the fix, normal text flushed the incomplete candidate to the caller.
  // We retain both channels until their JSON candidates are complete.
  // https://github.com/moeru-ai/airi/pull/2459#discussion_r3932132863
  it('holds an interleaved reasoning candidate for Issue #2161', async () => {
    const onStreamEvent = vi.fn()
    mockStreamEvents([
      { type: 'reasoning.delta', delta: 'Call: {"name":"builtIn_emitSparkCommand",' },
      { type: 'text.delta', delta: 'I can try.' },
      { type: 'reasoning.delta', delta: '"parameters":{}}' },
    ])

    await expect(streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([]) },
      options: { tools: [createSparkTool()], onStreamEvent },
    })).rejects.toThrow('tool call "builtIn_emitSparkCommand" as plain text')

    expect(onStreamEvent).not.toHaveBeenCalled()
  })

  it('preserves a JSON answer that does not name an available tool', async () => {
    const events: unknown[] = []
    const jsonAnswer = JSON.stringify({
      name: 'Airi',
      parameters: { likes: 'games' },
    })
    const jsonReasoning = JSON.stringify({
      name: 'analysis',
      parameters: { format: 'json' },
    })
    mockStreamEvents([
      { type: 'step.start' },
      { type: 'reasoning.delta', delta: jsonReasoning.slice(0, 10) },
      { type: 'reasoning.delta', delta: jsonReasoning.slice(10) },
      { type: 'text.delta', delta: jsonAnswer.slice(0, 10) },
      { type: 'text.delta', delta: jsonAnswer.slice(10) },
      { type: 'step.done', usage: {} },
    ])

    await streamFrom({
      model: 'model-a',
      chatProvider: provider,
      conversation: { turns: chatMessagesToTurns([{ role: 'user', content: 'Answer as JSON.' }] as Message[]) },
      options: {
        tools: [createSparkTool()],
        onStreamEvent: (event) => {
          events.push(event)
        },
      },
    })

    expect(events
      .filter((event): event is { type: 'reasoning-delta', text: string } => (
        typeof event === 'object' && event !== null && (event as { type?: unknown }).type === 'reasoning-delta'
      ))
      .map(event => event.text)
      .join(''))
      .toBe(jsonReasoning)
    expect(events
      .filter((event): event is { type: 'text-delta', text: string } => (
        typeof event === 'object' && event !== null && (event as { type?: unknown }).type === 'text-delta'
      ))
      .map(event => event.text)
      .join(''))
      .toBe(jsonAnswer)
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
