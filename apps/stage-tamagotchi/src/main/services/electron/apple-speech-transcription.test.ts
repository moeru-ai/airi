import { beforeEach, describe, expect, it, vi } from 'vitest'

type InvokeHandler = (payload: unknown) => unknown
type StreamHandler = (
  input: unknown,
  options?: { abortController?: AbortController },
) => AsyncGenerator<unknown>

const mocks = vi.hoisted(() => ({
  getCapabilities: vi.fn(),
  invokeHandlers: [] as InvokeHandler[],
  streamHandler: undefined as StreamHandler | undefined,
  transcribeAudio: vi.fn(),
  transcribePcmStream: vi.fn(),
}))

vi.mock('@moeru/eventa', async (importOriginal) => {
  const original = await importOriginal<typeof import('@moeru/eventa')>()
  return {
    ...original,
    defineInvokeHandler: vi.fn((
      _context: unknown,
      _event: unknown,
      handler: InvokeHandler,
    ) => {
      mocks.invokeHandlers.push(handler)
      return vi.fn()
    }),
    defineStreamInvokeHandler: vi.fn((
      _context: unknown,
      _event: unknown,
      handler: StreamHandler,
    ) => {
      mocks.streamHandler = handler
      return vi.fn()
    }),
  }
})

vi.mock('@proj-airi/apple-speech-transcription', () => ({
  getCapabilities: mocks.getCapabilities,
  transcribeAudio: mocks.transcribeAudio,
  transcribePcmStream: mocks.transcribePcmStream,
}))

const { createAppleSpeechTranscriptionService } = await import('./apple-speech-transcription')

beforeEach(() => {
  mocks.getCapabilities.mockReset()
  mocks.invokeHandlers.length = 0
  mocks.streamHandler = undefined
  mocks.transcribeAudio.mockReset()
  mocks.transcribePcmStream.mockReset()
  createAppleSpeechTranscriptionService({ context: {} as never })
})

describe('apple Speech transcription service', () => {
  it('forwards capability and file transcription invokes to the native package', async () => {
    const capabilities = { available: true, installedLocales: [], supportedLocales: ['en_US'] }
    const transcript = { durationMilliseconds: 12, isFinal: true, locale: 'en_US', text: 'hello' }
    mocks.getCapabilities.mockResolvedValue(capabilities)
    mocks.transcribeAudio.mockResolvedValue(transcript)
    const audio = new Uint8Array([1, 2])

    await expect(mocks.invokeHandlers[0]?.(undefined)).resolves.toEqual(capabilities)
    await expect(mocks.invokeHandlers[1]?.({ audio, fileExtension: 'wav', locale: 'en_US' })).resolves.toEqual(transcript)
    expect(mocks.transcribeAudio).toHaveBeenCalledWith(audio, 'en_US', 'wav')
  })

  it('reads the start frame and forwards PCM audio to the native stream', async () => {
    const receivedAudio: Uint8Array[] = []
    mocks.transcribePcmStream.mockImplementation(async function* (
      audioFrames: AsyncIterable<Uint8Array>,
      locale: string,
      sampleRate: number,
    ) {
      for await (const audio of audioFrames)
        receivedAudio.push(audio)

      yield { locale, sampleRate, text: 'hello' }
    })
    const input = new ReadableStream({
      start(controller) {
        controller.enqueue({ type: 'start', locale: 'en_US', sampleRate: 16000 })
        controller.enqueue({ type: 'audio', audio: new Uint8Array([1, 2]) })
        controller.close()
      },
    })
    const handler = mocks.streamHandler
    if (!handler)
      throw new Error('The service did not register its Eventa stream handler.')

    const updates = []
    for await (const update of handler(input))
      updates.push(update)

    expect(receivedAudio).toEqual([new Uint8Array([1, 2])])
    expect(updates).toEqual([{ locale: 'en_US', sampleRate: 16000, text: 'hello' }])
  })

  it('cancels a pending input read before it releases the reader', async () => {
    const abortController = new AbortController()
    let cancelReason: unknown
    const input = new ReadableStream({
      start(controller) {
        controller.enqueue({ type: 'start', locale: 'en_US', sampleRate: 16000 })
      },
      cancel(reason) {
        cancelReason = reason
      },
    })
    mocks.transcribePcmStream.mockImplementation(async function* (
      _audioFrames: AsyncIterable<Uint8Array>,
      _locale: string,
      _sampleRate: number,
      options: { signal?: AbortSignal },
    ) {
      await new Promise<void>((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true })
      })
      yield undefined
    })
    const handler = mocks.streamHandler
    if (!handler)
      throw new Error('The service did not register its Eventa stream handler.')

    const output = handler(input, { abortController })
    const nextUpdate = output.next()
    await vi.waitFor(() => expect(mocks.transcribePcmStream).toHaveBeenCalledOnce())
    abortController.abort('stop')

    await expect(nextUpdate).rejects.toBe('stop')
    expect(cancelReason).toBe('stop')
  })
})
