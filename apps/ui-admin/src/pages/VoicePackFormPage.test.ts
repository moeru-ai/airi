// @vitest-environment jsdom

import type { App } from 'vue'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'

import VoicePackFormPage from './VoicePackFormPage.vue'

const mocks = vi.hoisted(() => ({
  createVoicePack: vi.fn(),
  disableVoicePack: vi.fn(),
  replace: vi.fn(),
  route: {
    name: 'voice-pack-new',
    params: {},
  },
  speechModels: vi.fn(),
  speechVoices: vi.fn(),
  testSpeech: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  updateVoicePack: vi.fn(),
  voicePacks: vi.fn(),
}))

vi.mock('../modules/api', () => ({
  adminApi: {
    createVoicePack: mocks.createVoicePack,
    disableVoicePack: mocks.disableVoicePack,
    speechModels: mocks.speechModels,
    speechVoices: mocks.speechVoices,
    testSpeech: mocks.testSpeech,
    updateVoicePack: mocks.updateVoicePack,
    voicePacks: mocks.voicePacks,
  },
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({
    replace: mocks.replace,
  }),
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}))

describe('voice pack form page', () => {
  let app: App<Element>
  let host: HTMLElement

  beforeEach(() => {
    mocks.route.name = 'voice-pack-new'
    mocks.route.params = {}
    mocks.voicePacks.mockResolvedValue([])
    mocks.speechModels.mockResolvedValue({
      models: [
        { id: 'alibaba/cosyvoice-v1', name: 'alibaba/cosyvoice-v1' },
        { id: 'stepfun/stepaudio-2.5-tts', name: 'stepfun/stepaudio-2.5-tts' },
      ],
      default: null,
    })
    mocks.speechVoices.mockResolvedValue({
      voices: [{ id: 'longxiaochun', name: 'Long Xiaochun' }],
      recommended: { 'zh-CN': 'longxiaochun' },
    })
    document.body.innerHTML = '<div id="app"></div>'
    host = document.querySelector('#app')!
    app = createApp(VoicePackFormPage)
  })

  afterEach(() => {
    app.unmount()
    vi.clearAllMocks()
  })

  it('uses the configured speech catalog model when creating a new Voice Pack', async () => {
    app.mount(host)
    await flushPromises()

    expect(mocks.speechModels).toHaveBeenCalledTimes(1)
    expect(mocks.speechVoices).toHaveBeenCalledWith('alibaba/cosyvoice-v1')
    expect(mocks.speechVoices).not.toHaveBeenCalledWith('volcengine/seed-tts-2.0')
  })

  it('prefers the server speech catalog default when it is available', async () => {
    mocks.speechModels.mockResolvedValueOnce({
      models: [
        { id: 'alibaba/cosyvoice-v1', name: 'alibaba/cosyvoice-v1' },
        { id: 'stepfun/stepaudio-2.5-tts', name: 'stepfun/stepaudio-2.5-tts' },
      ],
      default: 'stepfun/stepaudio-2.5-tts',
    })

    app.mount(host)
    await flushPromises()

    expect(mocks.speechVoices).toHaveBeenCalledWith('stepfun/stepaudio-2.5-tts')
  })
})

async function flushPromises() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}
