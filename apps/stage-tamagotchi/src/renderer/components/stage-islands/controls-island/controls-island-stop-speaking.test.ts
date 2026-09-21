// @vitest-environment jsdom
import type { ControlsIslandPlacement } from './use-controls-island-placement'

import { useSpeakingStore } from '@proj-airi/stage-ui/stores/audio'
import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, shallowRef } from 'vue'

import ControlsIslandStopSpeaking from './controls-island-stop-speaking.vue'

import { controlsIslandPlacementKey } from './use-controls-island-placement'

const nowSpeakingRef = { value: false }
const stopAllSpeakingMock = vi.fn()
const placement: ControlsIslandPlacement = {
  dock: shallowRef('bottom-right'),
  isLeft: shallowRef(false),
  isTop: shallowRef(false),
  motionPhase: shallowRef('idle'),
}

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

// ROOT CAUSE:
// PR #2536 adds swipe actions to the shared UI entry point. The full reka-ui
// mock omitted createContext and failed while importing that entry point.
// Use the real primitives so this test also checks the production import graph.
// https://github.com/moeru-ai/airi/pull/2536

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
    const pinia = createPinia()
    app.use(pinia)
    useSpeakingStore(pinia).nowSpeaking = nowSpeakingRef.value
    app.provide(controlsIslandPlacementKey, placement)
    app.mount(host)
    return { host, app }
  }

  it('renders idle state when not speaking', async () => {
    nowSpeakingRef.value = false
    const { host, app } = mountComponent()
    await nextTick()
    expect(host.querySelectorAll('button')).toHaveLength(1)
    app.unmount()
    host.remove()
  })

  it('renders active state when speaking', async () => {
    nowSpeakingRef.value = true
    const { host, app } = mountComponent()
    await nextTick()
    expect(host.querySelectorAll('button')).toHaveLength(1)
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
