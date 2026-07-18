import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message, Tool } from '@xsai/shared-chat'

import { describe, expect, it, vi } from 'vitest'

import { isContentArrayRelatedError, sanitizeMessages, streamFrom } from './llm-service'

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

const provider = {
  chat: () => ({
    baseURL: 'https://example.com/',
  }),
} as unknown as ChatProvider

function createMockStreamResult(
  steps: Promise<unknown[]> = Promise.resolve([]),
  totalUsage: Promise<{ prompt_tokens: number, completion_tokens: number, total_tokens: number } | undefined> = Promise.resolve(undefined),
) {
  return {
    steps,
    messages: Promise.resolve([]),
    usage: Promise.resolve(undefined),
    totalUsage,
  }
}

describe('streamFrom tool error capture', () => {
  it('requests final streaming usage and emits the reported token totals once', async () => {
    const onUsage = vi.fn()
    streamTextMock.mockReturnValueOnce(createMockStreamResult(
      Promise.resolve([]),
      Promise.resolve({ prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 }),
    ))

    await streamFrom({
      model: 'model-a',
      chatProvider: provider,
      messages: [{ role: 'user', content: 'hello' }] as Message[],
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
      messages: [{ role: 'user', content: 'hello' }] as Message[],
      options: { onUsage },
    })

    expect(onUsage).toHaveBeenCalledWith({ source: 'unavailable' })
  })

  it('marks usage unavailable when the final usage object has no token fields', async () => {
    const onUsage = vi.fn()
    streamTextMock.mockReturnValueOnce(createMockStreamResult(
      Promise.resolve([]),
      Promise.resolve({} as { prompt_tokens: number, completion_tokens: number, total_tokens: number }),
    ))

    await streamFrom({
      model: 'model-a',
      chatProvider: provider,
      messages: [{ role: 'user', content: 'hello' }] as Message[],
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

    streamTextMock.mockReturnValueOnce(createMockStreamResult(
      Promise.reject(streamError),
      Promise.reject(totalUsageError),
    ))

    try {
      await expect(streamFrom({
        model: 'model-a',
        chatProvider: provider,
        messages: [{ role: 'user', content: 'hello' }] as Message[],
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
      messages: [{ role: 'user', content: 'hello' }] as Message[],
      options: {
        onUsage: () => {
          throw new Error('analytics unavailable')
        },
      },
    })).resolves.toBeUndefined()
  })

  /**
   * @example
   * await streamFrom({ model, chatProvider, messages, options: { captureToolErrors: true } })
   */
  it('keeps captureToolErrors internal while forwarding failed tool calls as tool-error events', async () => {
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
      captureToolErrors?: boolean
      onEvent: (event: unknown) => Promise<void>
      tools?: Tool[]
    }) => {
      const steps = new Promise<unknown[]>((resolve) => {
        resolveSteps = resolve
      })

      queueMicrotask(async () => {
        const result = await options.tools?.[0]?.execute({}, {
          messages: [],
          toolCallId: 'call-1',
        })

        await options.onEvent({
          type: 'tool-result',
          args: {},
          result,
          toolCallId: 'call-1',
          toolName: 'play_chess',
        })
        await options.onEvent({ type: 'finish', finishReason: 'stop' })
        resolveSteps?.([])
      })

      return createMockStreamResult(steps)
    })

    await streamFrom({
      model: 'model-a',
      chatProvider: provider,
      messages: [{ role: 'user', content: 'play chess' }] as Message[],
      options: {
        captureToolErrors: true,
        tools: [failingTool],
        onStreamEvent: (event) => {
          events.push(event)
        },
      },
    })

    const streamOptions = streamTextMock.mock.calls[0]?.[0]
    expect(streamOptions.captureToolErrors).toBeUndefined()
    expect(streamOptions.tools?.[0]).not.toBe(failingTool)
    expect(failingTool.execute).toHaveBeenCalledTimes(1)
    expect(events).toContainEqual(expect.objectContaining({
      type: 'tool-error',
      isError: true,
      toolCallId: 'call-1',
      toolName: 'play_chess',
      result: expect.stringContaining('Focus mode does not accept game-state mutation inputs.'),
    }))
  })
})

describe('sanitizeMessages', () => {
  it('rewrites internal `error`-role messages as user-role narrations', () => {
    /**
     * @example
     * sanitizeMessages([{ role: 'error', content: 'Remote sent 400' }])
     * // -> [{ role: 'user', content: 'User encountered error: Remote sent 400' }]
     */
    const out = sanitizeMessages([{ role: 'error', content: 'Remote sent 400' }])
    expect(out).toEqual([
      { role: 'user', content: 'User encountered error: Remote sent 400' },
    ])
  })

  it('flattens text-only content arrays to a string by default', () => {
    /**
     * @example
     * sanitizeMessages([{
     *   role: 'user',
     *   content: [{ type: 'text', text: 'hi' }, { type: 'text', text: ' there' }],
     * }])
     * // -> [{ role: 'user', content: 'hi there' }]
     */
    const out = sanitizeMessages([{
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
     * sanitizeMessages([{ role: 'user', content: [{type:'text',text:'see'},{type:'image_url',...}] }])
     * // -> unchanged: image_url part stays so vision-capable providers receive the image
     */
    const message = {
      role: 'user',
      content: [
        { type: 'text', text: 'see this' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
      ],
    }
    const out = sanitizeMessages([message])
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
     * sanitizeMessages([{ role:'user', content: [{type:'text',text:'hi'},{type:'image_url',...}] }], false)
     * // -> [{ role: 'user', content: 'hi' }]
     */
    const out = sanitizeMessages([
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
     * sanitizeMessages([{ role:'user', content: [{type:'text',text:'q'},{type:'input_audio',...},{type:'file',...}] }], false)
     * // -> [{ role: 'user', content: 'q' }]
     */
    const out = sanitizeMessages([
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
    expect(sanitizeMessages([{ role: 'user', content: 'plain' }], true))
      .toEqual([{ role: 'user', content: 'plain' }])
    expect(sanitizeMessages([{ role: 'user', content: 'plain' }], false))
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
