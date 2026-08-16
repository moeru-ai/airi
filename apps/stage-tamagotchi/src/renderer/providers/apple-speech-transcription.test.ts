import { afterEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({
  getCapabilities: vi.fn(),
  transcribe: vi.fn(),
  transcribeStream: vi.fn(),
}))

vi.mock('@proj-airi/electron-vueuse', () => ({
  getElectronEventaContext: vi.fn(() => ({})),
  useElectronEventaInvoke: vi.fn()
    .mockReturnValueOnce(electron.getCapabilities)
    .mockReturnValueOnce(electron.transcribe),
}))

vi.mock('@moeru/eventa', async (importOriginal) => {
  const original = await importOriginal<typeof import('@moeru/eventa')>()
  return {
    ...original,
    defineStreamInvoke: vi.fn(() => electron.transcribeStream),
  }
})

const { providerAppleSpeechTranscription } = await import('./apple-speech-transcription')

afterEach(() => {
  vi.clearAllMocks()
})

describe('apple Speech transcription provider', () => {
  it('lists supported locales and puts the preferred locale first', async () => {
    electron.getCapabilities.mockResolvedValue({
      available: true,
      installedLocales: ['zh_CN'],
      supportedLocales: ['zh_CN', 'en_US'],
    })

    const models = await providerAppleSpeechTranscription.extraMethods?.listModels?.(
      {},
      providerAppleSpeechTranscription.createProvider({}),
    )

    expect(models).toEqual([
      expect.objectContaining({ id: 'en_US', name: 'en-US' }),
      expect.objectContaining({ id: 'zh_CN', name: 'zh-CN' }),
    ])
  })

  it('sends encoded file audio through the unary Eventa boundary', async () => {
    electron.transcribe.mockResolvedValue({
      durationMilliseconds: 12,
      isFinal: true,
      locale: 'en_US',
      text: 'hello',
    })
    const speech = createSpeech('en_US')
    const form = new FormData()
    form.set('model', 'en_US')
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'sample.wav', { type: 'audio/wav' }))

    const response = await speech.fetch?.(new URL('https://example.invalid/transcription'), { body: form })

    expect(electron.transcribe).toHaveBeenCalledWith({
      audio: new Uint8Array([1, 2, 3]),
      fileExtension: 'wav',
      locale: 'en_US',
    })
    await expect(response?.json()).resolves.toEqual({ text: 'hello' })
  })

  it('streams a start frame, PCM audio, and replaceable snapshots through Eventa', async () => {
    electron.transcribeStream.mockReturnValue(new ReadableStream({
      start(controller) {
        controller.enqueue({
          durationMilliseconds: 500,
          isFinal: false,
          locale: 'zh_CN',
          startMilliseconds: 0,
          text: '你好',
        })
        controller.close()
      },
    }))
    const speech = createSpeech('zh_CN')
    const audio = new ReadableStream<ArrayBuffer>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]).buffer)
        controller.close()
      },
    })

    const response = await speech.fetch?.(
      new URL('https://example.invalid/transcription'),
      { body: audio as BodyInit },
    )
    const request = electron.transcribeStream.mock.calls[0]?.[0] as ReadableStream<unknown> | undefined
    if (!request)
      throw new Error('The provider did not open an Eventa request stream.')
    const frames = []
    for await (const frame of request)
      frames.push(frame)

    expect(frames).toEqual([
      { type: 'start', locale: 'zh_CN', sampleRate: 16000 },
      { type: 'audio', audio: new Uint8Array([1, 2]) },
    ])
    await expect(response?.text()).resolves.toContain('"type":"transcript.text.snapshot"')
  })
})

function createSpeech(locale: string) {
  const provider = providerAppleSpeechTranscription.createProvider({})
  if (!('transcription' in provider))
    throw new Error('The Apple Speech provider does not support transcription.')

  return provider.transcription(locale)
}
