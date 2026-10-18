import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { createTransportFetch } from '@proj-airi/ai-transport'
import { getDefinedProvider, getGenerationProvider } from '@proj-airi/provider-inference'
import { generateSpeech } from '@xsai/generate-speech'
import { generateText } from '@xsai/generate-text'
import { listModels } from '@xsai/model'
import { contextBridge, ipcRenderer } from 'electron'

import { aiTransportCancel, aiTransportGetEnabled, aiTransportRead, aiTransportSetEnabled, aiTransportStart } from '../src/shared/eventa/ai-transport'

const { context } = createContext(ipcRenderer)
const start = defineInvoke(context, aiTransportStart)
const read = defineInvoke(context, aiTransportRead)
const cancel = defineInvoke(context, aiTransportCancel)
const proxy = createTransportFetch({ start, read, cancel })

/** Test-only preload exercises the production Eventa contracts from an isolated renderer world. */
contextBridge.exposeInMainWorld('aiTransportSmoke', {
  enabled: defineInvoke(context, aiTransportGetEnabled),
  setEnabled: defineInvoke(context, aiTransportSetEnabled),
  start,
  read,
  cancel,
  async inference(baseURL: string) {
    const definition = getDefinedProvider('openai')!
    const provider = await definition.createProvider({ apiKey: 'test', baseUrl: baseURL, api: 'chat-completions' }, { t: key => key, fetch: proxy })
    const generation = getGenerationProvider(provider)!.generation('test-model')
    if (generation.protocol !== 'chat-completions')
      throw new Error('Unexpected test protocol')
    const chat = await generateText({ ...generation.config, messages: [{ role: 'user', content: 'hello' }] })
    const models = await listModels({ baseURL, apiKey: 'test', fetch: proxy })
    const audio = await generateSpeech({ baseURL, apiKey: 'test', fetch: proxy, model: 'test-tts', voice: 'alloy', input: 'hello' })
    const image = await proxy(new URL('images/generations', baseURL), { method: 'POST', body: JSON.stringify({ prompt: 'test' }) })
    const generated = await image.json() as { url: string }
    const downloaded = await proxy(generated.url)
    return { text: chat.text, model: models[0].id, audio: [...new Uint8Array(audio)], image: [...new Uint8Array(await downloaded.arrayBuffer())] }
  },
  async request(url: string, direct = false) {
    const response = await (direct ? fetch : proxy)(url)
    return { status: response.status, bytes: [...new Uint8Array(await response.arrayBuffer())] }
  },
  async multipart(url: string) {
    const body = new FormData()
    body.set('model', 'transcription')
    body.set('file', new Blob([new Uint8Array([0, 127, 128, 255])]), 'voice.wav')
    return await (await proxy(url, { method: 'POST', body })).json()
  },
  async stream(url: string) {
    const before = performance.now()
    const response = await proxy(url)
    const reader = response.body!.getReader()
    const first = await reader.read()
    const elapsed = performance.now() - before
    await reader.cancel()
    return { text: new TextDecoder().decode(first.value), elapsed }
  },
  async abort(url: string) {
    const controller = new AbortController()
    const pending = proxy(url, { signal: controller.signal })
    setTimeout(() => controller.abort(), 30)
    try {
      await pending
      return false
    }
    catch {
      return controller.signal.aborted
    }
  },
})
