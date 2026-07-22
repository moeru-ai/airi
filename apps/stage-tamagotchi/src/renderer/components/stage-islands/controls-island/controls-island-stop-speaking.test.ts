// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

import ControlsIslandStopSpeaking from './controls-island-stop-speaking.vue'

const nowSpeakingRef = { value: false }
const stopAllSpeakingMock = vi.fn()

vi.mock('@proj-airi/stage-ui/stores/audio', () => ({
  useSpeakingStore: () => ({
    nowSpeaking: nowSpeakingRef,
  }),
}))

vi.mock('@proj-airi/stage-layouts/composables/useStopSpeakingButton', () => ({
  useStopSpeakingButton: () => ({
    stopAllSpeaking: stopAllSpeakingMock,
    showStopSpeakingButton: nowSpeakingRef,
    stopSpeakingFromChat: vi.fn(),
  }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('pinia', () => ({
  storeToRefs: (store: object) => store,
}))

vi.mock('reka-ui', () => ({
  TooltipContent: { template: '<div><slot /></div>', inheritAttrs: false },
  TooltipProvider: { template: '<div><slot /></div>' },
  TooltipRoot: { template: '<div><slot /></div>' },
  TooltipTrigger: { template: '<div><slot /></div>' },
}))

describe('controlsIslandStopSpeaking', () => {
  function mountComponent() {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(ControlsIslandStopSpeaking, {
        buttonStyle: 'p-2',
        iconClass: 'size-5',
      }),
    })
    app.mount(host)
    return { host, app }
  }

  it('renders idle state when not speaking', async () => {
    nowSpeakingRef.value = false
    const { host, app } = mountComponent()
    await nextTick()
    expect(host.querySelectorAll('button').length).toBeGreaterThan(0)
    app.unmount()
    host.remove()
  })

  it('renders active state when speaking', async () => {
    nowSpeakingRef.value = true
    const { host, app } = mountComponent()
    await nextTick()
    expect(host.querySelectorAll('button').length).toBeGreaterThan(0)
    app.unmount()
    host.remove()
  })

  it('calls stopAllSpeaking on click', async () => {
    stopAllSpeakingMock.mockClear()
    nowSpeakingRef.value = false
    const { host, app } = mountComponent()
    await nextTick()
    const button = host.querySelector('button')
    expect(button).toBeTruthy()
    button!.click()
    expect(stopAllSpeakingMock).toHaveBeenCalledTimes(1)
    app.unmount()
    host.remove()
  })
})
