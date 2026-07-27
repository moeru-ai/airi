import { afterEach, describe, expect, it, vi } from 'vitest'

const whisperMock = vi.hoisted(() => ({
  load: vi.fn(async () => {}),
  transcribe: vi.fn(async () => 'hello local whisper'),
  state: 'ready' as string,
}))

vi.mock('../../../libs/inference/adapters/whisper', () => ({
  getWhisperAdapter: vi.fn(async () => whisperMock),
}))

vi.mock('../../../libs/audio/decode-audio-file', () => ({
  decodeAudioFileToMonoFloat32: vi.fn(async () => new Float32Array([0.1, -0.1])),
}))

describe('createBrowserLocalTranscriptionProvider', () => {
  afterEach(() => {
    vi.clearAllMocks()
    whisperMock.state = 'ready'
    whisperMock.transcribe.mockResolvedValue('hello local whisper')
  })

  // https://github.com/moeru-ai/airi/issues/1342
  it('issue #1342 transcribes FormData audio through the local Whisper adapter without a base URL', async () => {
    // ROOT CAUSE:
    //
    // Navigating to browser-local transcription opened a WIP placeholder, so
    // users could not configure or exercise the provider. The registered
    // metadata also required a base URL as if it were a remote OpenAI-compatible
    // endpoint, which blocked configuration for true in-browser Whisper.
    //
    // We fixed this by implementing a credential-free provider that decodes the
    // uploaded file and calls the existing Whisper adapter.
    const { createBrowserLocalTranscriptionProvider } = await import('./index')
    const { decodeAudioFileToMonoFloat32 } = await import('../../../libs/audio/decode-audio-file')

    const provider = createBrowserLocalTranscriptionProvider({ language: 'en' })
    const request = provider.transcription('whisper-large-v3-turbo', { language: 'zh' })

    const form = new FormData()
    form.append('file', new File([new Uint8Array([1, 2, 3])], 'clip.wav', { type: 'audio/wav' }))
    form.append('model', 'whisper-large-v3-turbo')

    const response = await request.fetch!(new URL('http://browser-local-audio-transcription/v1/audio/transcriptions'), {
      method: 'POST',
      body: form,
    })

    expect(response.ok).toBe(true)
    await expect(response.json()).resolves.toEqual({ text: 'hello local whisper' })
    expect(decodeAudioFileToMonoFloat32).toHaveBeenCalledOnce()
    expect(whisperMock.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'zh',
        audioFloat32: expect.any(Float32Array),
      }),
      expect.any(Object),
    )
  })

  // https://github.com/moeru-ai/airi/issues/1342
  it('issue #1342 loads the Whisper model when the adapter is not ready yet', async () => {
    whisperMock.state = 'idle'

    const { createBrowserLocalTranscriptionProvider } = await import('./index')
    const provider = createBrowserLocalTranscriptionProvider()
    const request = provider.transcription('whisper-large-v3-turbo')

    const form = new FormData()
    form.append('file', new Blob([new Uint8Array([9])], { type: 'audio/wav' }))

    await request.fetch!(new URL('http://browser-local/v1/audio/transcriptions'), {
      method: 'POST',
      body: form,
    })

    expect(whisperMock.load).toHaveBeenCalledOnce()
    expect(whisperMock.transcribe).toHaveBeenCalledOnce()
  })
})
