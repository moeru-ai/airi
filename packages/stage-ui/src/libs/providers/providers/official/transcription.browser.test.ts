import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'

import { useAuthStore } from '../../../../stores/auth'
import { setAITransportFetch } from '../../../ai-transport'
import { AIRI_CHAT_SESSION_ID_HEADER } from '../../../product-signals/headers'
import { streamTranscription } from '../../stream-transcription'
import { providerOfficialTranscription } from './index'

const pinia = createPinia()

afterEach(() => {
  setAITransportFetch((...args) => globalThis.fetch(...args))
  vi.unstubAllGlobals()
  disposePinia(pinia)
  setActivePinia(undefined)
})

// https://github.com/moeru-ai/airi/pull/3027#discussion_r4503040715
// ROOT CAUSE:
// The official provider selected a bridge that buffers uploads until the microphone stream closes.
// Its live transcription requests now use authenticated browser streaming.
it('sends authenticated live audio before the microphone stream closes (Issue #3027)', async () => {
  setActivePinia(pinia)
  useAuthStore().token = 'test-token'
  const bridgeFetch = vi.fn<typeof fetch>().mockRejectedValue(new Error('Buffered uploads cannot carry live audio.'))
  setAITransportFetch(bridgeFetch)

  const audio = new TransformStream<Uint8Array, Uint8Array>()
  const writer = audio.writable.getWriter()
  const chunk = new Uint8Array([1, 2, 3])
  let uploadReader: ReadableStreamDefaultReader<Uint8Array> | undefined
  const browserFetch = vi.fn<typeof fetch>(async (input, init) => {
    const request = new Request(input, init)
    expect(request.headers.get('Authorization')).toBe('Bearer test-token')
    expect(request.headers.get(AIRI_CHAT_SESSION_ID_HEADER)).toBe('test-session')
    expect(request.credentials).toBe('omit')
    uploadReader = request.body!.getReader()
    expect(await uploadReader.read()).toEqual({ done: false, value: chunk })
    return new Response('data: {"type":"transcript.text.delta","delta":"hello"}\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  })
  vi.stubGlobal('fetch', browserFetch)

  const provider = await providerOfficialTranscription.createProvider({}, { t: key => key, fetch: bridgeFetch })
  if (!('transcription' in provider))
    throw new Error('The official provider must expose transcription.')
  const request = provider.transcription('auto')
  const result = streamTranscription({
    ...request,
    headers: { [AIRI_CHAT_SESSION_ID_HEADER]: 'test-session' },
    inputAudioStream: audio.readable,
  })
  const write = writer.write(chunk)
  try {
    await expect(result.text).resolves.toBe('hello')
    expect(browserFetch).toHaveBeenCalledOnce()
    expect(bridgeFetch).not.toHaveBeenCalled()
  }
  finally {
    await uploadReader?.cancel()
    await writer.abort().catch(() => {})
    await write.catch(() => {})
  }
})
