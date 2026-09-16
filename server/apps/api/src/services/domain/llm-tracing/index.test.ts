import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { startChatGeneration, startTtsGeneration } from '.'

// Mock the Langfuse SDK so tests assert what the module sends to it without a
// real exporter. `startObservation` returns a stub generation whose methods are
// spies; `otelSpan.setAttribute` captures trace-identity attributes.
const generationStub = {
  otelSpan: { setAttribute: vi.fn() },
  update: vi.fn(),
  end: vi.fn(),
}
const startObservation = vi.fn((_name: string, _attributes: unknown, _options: unknown) => generationStub)
vi.mock('@langfuse/tracing', () => ({
  startObservation: (name: string, attributes: unknown, options: unknown) => startObservation(name, attributes, options),
}))

const BASE_INPUT = {
  input: [{ role: 'user', content: 'hi' }],
  model: 'openai/gpt-5-mini',
  requestId: 'req-1',
  stream: false,
  userId: 'user-1',
}

beforeEach(() => {
  startObservation.mockClear()
  generationStub.otelSpan.setAttribute.mockClear()
  generationStub.update.mockClear()
  generationStub.end.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('startChatGeneration', () => {
  describe('when LANGFUSE_TRACING_ACTIVE is not "1"', () => {
    it('returns a no-op trace and never calls the SDK', () => {
      // @example disabled deployment: no env set
      const trace = startChatGeneration(BASE_INPUT)
      trace.appendStreamChunk('data: {"choices":[{"delta":{"content":"x"}}]}\n')
      trace.succeed({ output: 'x', promptTokens: 1, completionTokens: 1 })
      trace.fail('should be ignored')

      expect(startObservation).not.toHaveBeenCalled()
      expect(generationStub.update).not.toHaveBeenCalled()
      expect(generationStub.end).not.toHaveBeenCalled()
    })
  })

  describe('when LANGFUSE_TRACING_ACTIVE is "1"', () => {
    beforeEach(() => {
      vi.stubEnv('LANGFUSE_TRACING_ACTIVE', '1')
    })

    it('creates a generation with input/model/metadata and trace identity', () => {
      // @example a request with a client conversation id
      startChatGeneration({ ...BASE_INPUT, sessionId: 'sess-9', stream: true })

      expect(startObservation).toHaveBeenCalledWith(
        'chat.completion',
        {
          input: BASE_INPUT.input,
          model: BASE_INPUT.model,
          metadata: { requestId: 'req-1', stream: true },
        },
        { asType: 'generation' },
      )
      expect(generationStub.otelSpan.setAttribute).toHaveBeenCalledWith('langfuse.user.id', 'user-1')
      expect(generationStub.otelSpan.setAttribute).toHaveBeenCalledWith('langfuse.session.id', 'sess-9')
    })

    it('omits session attribute when no sessionId is supplied', () => {
      // @example a request without x-airi-session-id → user-only attribution
      startChatGeneration(BASE_INPUT)

      expect(generationStub.otelSpan.setAttribute).toHaveBeenCalledWith('langfuse.user.id', 'user-1')
      expect(generationStub.otelSpan.setAttribute).not.toHaveBeenCalledWith('langfuse.session.id', expect.anything())
    })

    it('records explicit output + usage + flux on succeed (non-streaming)', () => {
      // @example non-streaming completion passes the parsed response body
      const trace = startChatGeneration(BASE_INPUT)
      trace.succeed({ output: { ok: true }, promptTokens: 12, completionTokens: 34, fluxConsumed: 5 })

      expect(generationStub.update).toHaveBeenCalledWith({
        output: { ok: true },
        usageDetails: { input: 12, output: 34 },
        metadata: { requestId: 'req-1', stream: false, fluxConsumed: 5 },
      })
      expect(generationStub.end).toHaveBeenCalledTimes(1)
    })

    it('assembles streamed assistant text across chunk boundaries for succeed output', () => {
      // @example a delta whose JSON is split mid-key across two chunks
      const trace = startChatGeneration({ ...BASE_INPUT, stream: true })
      trace.appendStreamChunk('data: {"choices":[{"delta":{"role":"assistant"}}]}\n')
      trace.appendStreamChunk('data: {"choices":[{"delta":{"con')
      trace.appendStreamChunk('tent":"Hel"}}]}\ndata: {"choices":[{"delta":{"content":"lo"}}]}\n')
      trace.appendStreamChunk('data: [DONE]\n')
      trace.succeed({ promptTokens: 2, completionTokens: 1, fluxConsumed: 1 })

      expect(generationStub.update).toHaveBeenCalledWith({
        output: 'Hello',
        usageDetails: { input: 2, output: 1 },
        metadata: { requestId: 'req-1', stream: true, fluxConsumed: 1 },
      })
    })

    it('ignores malformed and non-text SSE lines when assembling output', () => {
      // @example usage-only chunk, blank line, and broken JSON contribute nothing
      const trace = startChatGeneration({ ...BASE_INPUT, stream: true })
      trace.appendStreamChunk('\n')
      trace.appendStreamChunk('data: {bad json\n')
      trace.appendStreamChunk('data: {"choices":[],"usage":{"prompt_tokens":5}}\n')
      trace.appendStreamChunk('data: {"choices":[{"delta":{"content":"A"}}]}\n')
      trace.succeed({})

      expect(generationStub.update).toHaveBeenCalledWith(
        expect.objectContaining({ output: 'A' }),
      )
    })

    it('records ERROR level + message on fail', () => {
      // @example router exhaustion / upstream non-2xx
      const trace = startChatGeneration(BASE_INPUT)
      trace.fail('Gateway 502')

      expect(generationStub.update).toHaveBeenCalledWith({
        level: 'ERROR',
        statusMessage: 'Gateway 502',
        metadata: { requestId: 'req-1', stream: false },
      })
      expect(generationStub.end).toHaveBeenCalledTimes(1)
    })

    it('ends only once even if succeed/fail are called repeatedly', () => {
      // @example defensive: overlapping transport exit branches
      const trace = startChatGeneration(BASE_INPUT)
      trace.succeed({ output: 'first' })
      trace.succeed({ output: 'second' })
      trace.fail('late failure')

      expect(generationStub.end).toHaveBeenCalledTimes(1)
      expect(generationStub.update).toHaveBeenCalledTimes(1)
      expect(generationStub.update).toHaveBeenCalledWith(expect.objectContaining({ output: 'first' }))
    })

    it('hard-caps streamed assistant text even when one SSE delta exceeds the remaining space', () => {
      // @example a single very large provider delta should not overflow the buffer cap
      const trace = startChatGeneration({ ...BASE_INPUT, stream: true })
      trace.appendStreamChunk(`data: ${JSON.stringify({ choices: [{ delta: { content: 'x'.repeat(1_100_000) } }] })}\n`)
      trace.succeed({})

      const output = generationStub.update.mock.calls[0][0].output
      expect(output).toHaveLength(1_000_000)
    })

    it('creates a TTS generation and records character usage without buffering audio', () => {
      // @example /audio/speech request: text in, content-type metadata out
      const trace = startTtsGeneration({
        input: { text: 'hello', voice: 'alloy', responseFormat: 'mp3' },
        model: 'tts-1',
        requestId: 'tts-1',
        userId: 'user-1',
        sessionId: 'sess-1',
      })
      trace.succeed({
        inputChars: 5,
        fluxConsumed: 2,
        output: { contentType: 'audio/mpeg' },
      })

      expect(startObservation).toHaveBeenCalledWith(
        'tts.speech',
        {
          input: { text: 'hello', voice: 'alloy', responseFormat: 'mp3' },
          model: 'tts-1',
          metadata: {
            requestId: 'tts-1',
            inputChars: 5,
            voice: 'alloy',
            speed: undefined,
            responseFormat: 'mp3',
          },
        },
        { asType: 'generation' },
      )
      expect(generationStub.update).toHaveBeenCalledWith({
        output: { contentType: 'audio/mpeg' },
        usageDetails: { input: 5 },
        metadata: {
          requestId: 'tts-1',
          inputChars: 5,
          voice: 'alloy',
          speed: undefined,
          responseFormat: 'mp3',
          fluxConsumed: 2,
        },
      })
      expect(generationStub.otelSpan.setAttribute).toHaveBeenCalledWith('langfuse.session.id', 'sess-1')
      expect(generationStub.end).toHaveBeenCalledTimes(1)
    })
  })
})
