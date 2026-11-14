import en from '@proj-airi/i18n/locales/en'

import { defineInvokeHandler } from '@moeru/eventa'
import { artistryGenerateHeadless } from '@proj-airi/stage-shared'
import { useBackgroundStore } from '@proj-airi/stage-ui/stores/background'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'

import { imageJournalTools } from './image-journal'

const ipc = await vi.hoisted(async () => {
  const { createContext } = await import('@moeru/eventa')
  return { context: createContext() }
})

vi.mock('@moeru/eventa/adapters/electron/renderer', () => ({
  createContext: () => ({ context: ipc.context }),
}))

let pinia: ReturnType<typeof createPinia>

beforeEach(() => {
  localStorage.clear()
  pinia = createPinia()
  setActivePinia(pinia)
  vi.stubGlobal('electron', { ipcRenderer: {} })
})

afterEach(() => {
  disposePinia(pinia)
  localStorage.clear()
  vi.unstubAllGlobals()
})

// The tool lacked dimensions, so a 1024x1024 retry reused an invalid 1080px default.
it('sends explicit retry dimensions through the headless IPC options', async () => {
  render(defineComponent({
    setup() {
      useAiriCardStore()
      useBackgroundStore()
      return () => null
    },
  }), { global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })] } })
  const tools = await imageJournalTools()
  const tool = tools.find(tool => tool.function.name === 'image_journal')!
  expect(tool.function.parameters).toMatchObject({
    properties: { width: { type: ['integer', 'null'] }, height: { type: ['integer', 'null'] } },
    required: expect.arrayContaining(['width', 'height']),
  })
  const store = useArtistryStore()
  store.openaiImageWidth = '1920'
  store.openaiImageHeight = '1080'
  store.providerOptions = { width: 1536, height: 1024, seed: 42 }
  const generate = vi.fn<(payload: unknown) => void>()
  const handler = defineInvokeHandler(ipc.context, artistryGenerateHeadless, (payload) => {
    generate(payload)
    return { error: 'Test service stopped before generation.' }
  })
  try {
    await tool.execute({
      action: 'create',
      prompt: 'A landscape.',
      title: null,
      query: null,
      mode: 'inline',
      width: 1024,
      height: 1024,
    }, { messages: [], toolCallId: 'image-retry' })
    expect(generate).toHaveBeenCalledOnce()
    expect(generate.mock.calls[0]?.[0]).toMatchObject({
      options: { width: 1024, height: 1024, seed: 42 },
      globals: { openaiImageWidth: '1920', openaiImageHeight: '1080' },
    })
    await tool.execute({
      action: 'create',
      prompt: 'A landscape.',
      title: null,
      query: null,
      mode: 'inline',
      width: null,
      height: null,
    }, { messages: [], toolCallId: 'image-defaults' })
    expect(generate.mock.calls[1]?.[0]).toMatchObject({ options: { width: 1536, height: 1024, seed: 42 } })
    await expect(tool.execute({
      action: 'create',
      prompt: 'A landscape.',
      width: 1024,
      height: null,
    }, { messages: [], toolCallId: 'image-partial' })).rejects.toThrow('Set both width and height')
    expect(generate).toHaveBeenCalledTimes(2)
  }
  finally {
    handler()
  }
})
