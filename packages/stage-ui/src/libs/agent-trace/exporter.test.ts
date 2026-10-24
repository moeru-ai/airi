import type { AgentTraceUploadSpan } from './exporter'

import { IOAttributes, IOSpanNames } from '@proj-airi/stage-shared'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { startSpan, subscribeIOSpan } from '../../composables/use-io-tracer'
import { createAgentTraceExporter } from './exporter'

const unsubscribers: (() => void)[] = []

afterEach(() => {
  unsubscribers.splice(0).forEach(unsubscribe => unsubscribe())
})

function setup(options: { enabled?: () => boolean, token?: string | null, fetch?: typeof globalThis.fetch } = {}) {
  const uploads: { spans: AgentTraceUploadSpan[], resource: unknown }[] = []
  const fetch = options.fetch ?? vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    uploads.push(JSON.parse(init!.body as string))
    return new Response(null, { status: 202 })
  })
  const exporter = createAgentTraceExporter({
    enabled: options.enabled ?? (() => true),
    resource: () => ({ appSurface: 'web', appVersion: '1.0.0' }),
    token: () => options.token === undefined ? 'token' : options.token,
    endpoint: 'https://api.example/api/v1/agent-traces',
    fetch,
  })
  unsubscribers.push(subscribeIOSpan(exporter.handleSpan))
  return { exporter, uploads, fetch }
}

/** Runs one turn: a voice input root, the turn, one LLM inference, and a tool call. */
function runTurn(steps: boolean[], mark: (traceId: string, official: boolean) => void) {
  const voice = startSpan(IOSpanNames.VoiceInput, undefined, { [IOAttributes.VoiceInputTrigger]: 'speech' })
  const recognition = startSpan(IOSpanNames.SpeechRecognition, voice, { [IOAttributes.ASRText]: 'what the user said' })
  recognition.end()
  voice.end()
  const turn = startSpan(IOSpanNames.InteractionTurn, voice, { [IOAttributes.TurnId]: 'turn-1', [IOAttributes.GenAIConversationId]: 'session-1' })
  const traceId = turn.spanContext().traceId
  for (const official of steps)
    mark(traceId, official)
  const llm = startSpan(IOSpanNames.LLMInference, turn, { [IOAttributes.GenAIRequestModel]: 'model', [IOAttributes.LLMInputMessageRoles]: 'user' })
  llm.end()
  turn.end()
  const playback = startSpan(IOSpanNames.AudioPlayback, turn, { [IOAttributes.TTSText]: 'what the model said', [IOAttributes.TTSSegmentId]: 'segment-1' })
  playback.end()
  return traceId
}

describe('agent trace exporter', () => {
  it('uploads a turn that used only the official provider, without content attributes', async () => {
    const { exporter, uploads } = setup()
    const traceId = runTurn([true, true], exporter.markStep)
    await exporter.flush()

    expect(uploads).toHaveLength(1)
    expect(uploads[0].resource).toEqual({ appSurface: 'web', appVersion: '1.0.0' })
    const spans = uploads[0].spans
    expect(spans.map(span => span.name)).toEqual([IOSpanNames.SpeechRecognition, IOSpanNames.VoiceInput, IOSpanNames.LLMInference, IOSpanNames.InteractionTurn, IOSpanNames.AudioPlayback])
    expect(spans.every(span => span.traceId === traceId)).toBe(true)
    const turn = spans.find(span => span.name === IOSpanNames.InteractionTurn)!
    expect(turn.attributes).toEqual({ [IOAttributes.TurnId]: 'turn-1', [IOAttributes.GenAIConversationId]: 'session-1' })
    const body = JSON.stringify(uploads)
    expect(body).not.toContain('what the user said')
    expect(body).not.toContain('what the model said')
    expect(body).not.toContain(IOAttributes.Subsystem)
    expect(body).not.toContain(IOAttributes.LLMInputMessageRoles)
  })

  it('drops a turn with a step that used another provider, and a turn with no step', async () => {
    const { exporter, uploads, fetch } = setup()
    runTurn([true, false], exporter.markStep)
    runTurn([], exporter.markStep)
    await exporter.flush()
    expect(fetch).not.toHaveBeenCalled()
    expect(uploads).toHaveLength(0)
  })

  it('uploads nothing while analytics is off or the user is signed out', async () => {
    let enabled = false
    const off = setup({ enabled: () => enabled })
    runTurn([true], off.exporter.markStep)
    enabled = true
    await off.exporter.flush()
    expect(off.fetch).not.toHaveBeenCalled()

    const signedOut = setup({ token: null })
    runTurn([true], signedOut.exporter.markStep)
    await signedOut.exporter.flush()
    expect(signedOut.fetch).not.toHaveBeenCalled()
  })

  it('drops a batch whose upload fails, without throwing or retrying', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('offline')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { exporter } = setup({ fetch })
    runTurn([true], exporter.markStep)
    await expect(exporter.flush()).resolves.toBeUndefined()
    await exporter.flush()
    expect(fetch).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})
