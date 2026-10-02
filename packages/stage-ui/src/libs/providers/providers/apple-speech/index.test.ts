import type { AppleSpeechSessionOperations, StartStreamTranscriptionOptions, TranscriptionResult } from '@xsai-apple-speech/transcription'
import type { ZodObject } from 'zod'

import { createStreamTranscriptionResult } from '@xsai-apple-speech/transcription'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { executeAppleSpeechStream, providerAppleSpeechTranscription } from '.'

const mocks = vi.hoisted(() => ({
  dispose: vi.fn(),
  getLocales: vi.fn(),
}))

vi.mock('@moeru/eventa/adapters/electron/renderer', () => ({
  createContext: () => ({ context: {}, dispose: mocks.dispose }),
}))

vi.mock('@proj-airi/stage-shared', () => ({
  isElectronWindow: () => true,
  isStageTamagotchi: () => true,
}))

vi.mock('@xsai-apple-speech/transcription-electron-plugin', () => ({
  createAppleSpeechProvider: () => ({
    getLocales: mocks.getLocales,
  }),
}))

describe('apple speech transcription provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('loads labeled locale options with automatic transcriber selection', async () => {
    vi.stubGlobal('window', {
      electron: { ipcRenderer: {} },
      platform: 'darwin',
    })
    mocks.getLocales.mockResolvedValue([
      { installed: false, locale: 'en-US' },
      { installed: true, locale: 'zh-CN' },
    ])

    const schema = await providerAppleSpeechTranscription.createProviderConfig({
      t: input => input,
      config: { locale: 'zh-CN' },
    })
    const localeMeta = (schema as ZodObject).shape.locale.meta()

    expect(mocks.getLocales).toHaveBeenCalledWith({ transcriber: 'automatic' })
    expect(localeMeta?.type).toBe('select')
    expect(localeMeta?.options).toEqual([
      expect.objectContaining({ value: 'zh-CN' }),
      expect.objectContaining({ value: 'en-US' }),
    ])
    expect(localeMeta?.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: expect.stringContaining('zh-CN') }),
      expect.objectContaining({ label: expect.stringContaining('en-US') }),
    ]))
    expect(mocks.dispose).toHaveBeenCalledOnce()
  })

  it('exposes its Hearing settings view through the provider definition', () => {
    expect(providerAppleSpeechTranscription.views?.hearing).toBeTypeOf('function')
  })

  it('converts PCM16 input and emits AIRI transcript snapshots', async () => {
    const writtenSamples: Float32Array[] = []
    const finalResult: TranscriptionResult = {
      locale: 'en-US',
      results: [{
        range: {
          durationMilliseconds: 400,
          isFinal: true,
          startMilliseconds: 100,
        },
        text: 'Hello, AIRI.',
      }],
      text: 'Hello, AIRI.',
    }

    const result = executeAppleSpeechStream({
      baseURL: new URL('apple-speech://transcription'),
      fetch: globalThis.fetch,
      inputAudioStream: new ReadableStream({
        start(controller) {
          controller.enqueue(new Int16Array([-32768, -16384, 0, 16384, 32767]).buffer)
          controller.close()
        },
      }),
      inputSampleRate: 16000,
      model: 'apple-speech',
      startStream: (streamOptions: StartStreamTranscriptionOptions) => createStreamTranscriptionResult({
        ...streamOptions,
        locale: 'en-US',
        async start(request): Promise<AppleSpeechSessionOperations> {
          return {
            async dispose() {},
            async finish() {
              return finalResult
            },
            async write(samples) {
              writtenSamples.push(samples.slice())
              await request.onPartial({
                locale: 'en-US',
                range: {
                  durationMilliseconds: 300,
                  isFinal: false,
                  startMilliseconds: 100,
                },
                text: 'Hello, Ari',
                type: 'transcript.text.partial',
              })
            },
          }
        },
      }),
    })

    await expect(result.text).resolves.toBe('Hello, AIRI.')
    expect(writtenSamples).toHaveLength(1)
    expect(Array.from(writtenSamples[0] ?? [])).toEqual([
      -1,
      -0.5,
      0,
      0.5,
      32767 / 32768,
    ])

    const events = []
    for await (const event of result.fullStream)
      events.push(event)

    expect(events).toEqual([
      {
        durationMilliseconds: 300,
        isFinal: false,
        locale: 'en-US',
        startMilliseconds: 100,
        text: 'Hello, Ari',
        type: 'transcript.text.snapshot',
      },
      {
        durationMilliseconds: 400,
        isFinal: true,
        locale: 'en-US',
        startMilliseconds: 100,
        text: 'Hello, AIRI.',
        type: 'transcript.text.snapshot',
      },
    ])
  })
})
