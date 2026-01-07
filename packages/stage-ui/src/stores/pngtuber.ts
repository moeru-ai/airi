import type { PNGtuberManifest } from './display-models'

import { useBroadcastChannel } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import { createResettableLocalStorage, createResettableRef } from '../utils/resettable'

type BroadcastChannelEvents
  = | BroadcastChannelEventShouldUpdateView

interface BroadcastChannelEventShouldUpdateView {
  type: 'should-update-view'
}

export const usePNGtuberStore = defineStore('pngtuber', () => {
  const { post, data } = useBroadcastChannel<BroadcastChannelEvents, BroadcastChannelEvents>({ name: 'airi-stores-pngtuber' })
  const shouldUpdateViewHooks = ref<Array<() => void>>([])

  const onShouldUpdateView = (hook: () => void) => {
    shouldUpdateViewHooks.value.push(hook)
  }

  function shouldUpdateView() {
    post({ type: 'should-update-view' })
    shouldUpdateViewHooks.value.forEach(hook => hook())
  }

  watch(data, (event) => {
    if (event.type === 'should-update-view') {
      shouldUpdateViewHooks.value.forEach(hook => hook())
    }
  })

  // Current manifest
  const [manifest, resetManifest] = createResettableRef<PNGtuberManifest | null>(null)

  // Position and scale
  const [position, resetPosition] = createResettableLocalStorage('settings/pngtuber/position', { x: 0, y: 0 })
  const [scale, resetScale] = createResettableLocalStorage('settings/pngtuber/scale', 1)

  // Current emotion state
  const [currentEmotion, resetCurrentEmotion] = createResettableRef<string | null>(null)

  // Blink state (controlled by component, stored here for cross-component access)
  const [isBlinking, resetIsBlinking] = createResettableRef(false)

  // Auto blink settings
  const [autoBlinkEnabled, resetAutoBlinkEnabled] = createResettableLocalStorage('settings/pngtuber/auto-blink-enabled', true)
  const [autoBlinkMinInterval, resetAutoBlinkMinInterval] = createResettableLocalStorage('settings/pngtuber/auto-blink-min-interval', 3000)
  const [autoBlinkMaxInterval, resetAutoBlinkMaxInterval] = createResettableLocalStorage('settings/pngtuber/auto-blink-max-interval', 8000)
  const [blinkDuration, resetBlinkDuration] = createResettableLocalStorage('settings/pngtuber/blink-duration', 150)

  // Mouth threshold settings (lower default for more responsive lip sync)
  const [mouthOpenThreshold, resetMouthOpenThreshold] = createResettableLocalStorage('settings/pngtuber/mouth-open-threshold', 0.15)

  function setEmotion(emotion: string | null) {
    currentEmotion.value = emotion
  }

  function resetState() {
    resetManifest()
    resetPosition()
    resetScale()
    resetCurrentEmotion()
    resetIsBlinking()
    resetAutoBlinkEnabled()
    resetAutoBlinkMinInterval()
    resetAutoBlinkMaxInterval()
    resetBlinkDuration()
    resetMouthOpenThreshold()
    shouldUpdateView()
  }

  return {
    manifest,
    position,
    scale,
    currentEmotion,
    isBlinking,
    autoBlinkEnabled,
    autoBlinkMinInterval,
    autoBlinkMaxInterval,
    blinkDuration,
    mouthOpenThreshold,

    setEmotion,
    onShouldUpdateView,
    shouldUpdateView,
    resetState,
  }
})
