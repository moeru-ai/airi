// @vitest-environment jsdom
import type { ControlsIslandPlacement } from './use-controls-island-placement'

import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref, shallowRef } from 'vue'

import ControlsIslandSpeechMute from './controls-island-speech-mute.vue'

import { controlsIslandPlacementKey } from './use-controls-island-placement'

const speechMuted = ref(false)
const toggleSpeechMutedMock = vi.fn()
const placement: ControlsIslandPlacement = {
  dock: shallowRef('bottom-right'),
  isLeft: shallowRef(false),
  isTop: shallowRef(false),
  motionPhase: shallowRef('idle'),
}

vi.mock('@proj-airi/stage-layouts/composables/useStopSpeakingButton', () => ({
  useStopSpeakingButton: () => ({
    speechMuted,
    toggleSpeechMuted: toggleSpeechMutedMock,
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

describe('controlsIslandSpeechMute', () => {
  function mountComponent() {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(ControlsIslandSpeechMute, {
        buttonStyle: 'p-2',
        iconClass: 'size-5',
      }),
    })
    app.provide(controlsIslandPlacementKey, placement)
    app.mount(host)
    return { host, app }
  }

  it('offers to mute while speech output is on', async () => {
    speechMuted.value = false
    const { host, app } = mountComponent()
    await nextTick()
    const button = host.querySelector('button')
    expect(button!.getAttribute('aria-label')).toBe('tamagotchi.stage.controls-island.mute')
    expect(button!.getAttribute('aria-pressed')).toBe('false')
    expect(host.querySelector('.i-solar\\:volume-loud-outline')).toBeTruthy()
    app.unmount()
    host.remove()
  })

  it('offers to unmute while speech output is muted', async () => {
    speechMuted.value = true
    const { host, app } = mountComponent()
    await nextTick()
    const button = host.querySelector('button')
    expect(button!.getAttribute('aria-label')).toBe('tamagotchi.stage.controls-island.unmute')
    expect(button!.getAttribute('aria-pressed')).toBe('true')
    expect(host.querySelector('.i-solar\\:volume-cross-outline')).toBeTruthy()
    app.unmount()
    host.remove()
  })

  // Muting is reachable before AIRI speaks, which is what keeps a user from
  // paying for synthesis they do not want to hear. The chat panel's interrupt
  // button owns stopping speech that already plays.
  it('toggles speech output on click', async () => {
    toggleSpeechMutedMock.mockClear()
    speechMuted.value = false
    const { host, app } = mountComponent()
    await nextTick()
    const button = host.querySelector('button')
    expect(button).toBeTruthy()
    expect(button!.disabled).toBe(false)
    button!.click()
    expect(toggleSpeechMutedMock).toHaveBeenCalledTimes(1)
    app.unmount()
    host.remove()
  })
})
