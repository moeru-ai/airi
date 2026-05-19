import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { useBroadcastChannel } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import { supportedControl, useSpineViewControl } from './view-control'

type BroadcastChannelEvents
  = | BroadcastChannelEventShouldUpdateView

interface BroadcastChannelEventShouldUpdateView {
  type: 'spine-should-update-view'
}

export interface SpineAnimationDescriptor {
  name: string
  duration: number
}

export interface SpineSkinDescriptor {
  name: string
}

export interface SpineVariantDescriptor {
  name: string
}

/** Persisted runtime state for the active Spine model. */
export interface SpineCurrentAnimation {
  /** Animation name resolved against the loaded skeleton. */
  name: string
  /** Whether the animation should loop on track 0. */
  loop: boolean
  /** Optional one-shot trigger; bumped to force re-application. */
  nonce?: number
}

export const defaultSpineAnimation: SpineCurrentAnimation = {
  name: 'idle',
  loop: true,
}

export const useSpine = defineStore('spine', () => {
  const { post, data } = useBroadcastChannel<BroadcastChannelEvents, BroadcastChannelEvents>({
    name: 'airi-stores-stage-ui-spine',
  })
  const shouldUpdateViewHooks = ref(new Set<() => void>())

  const onShouldUpdateView = (hook: () => void) => {
    shouldUpdateViewHooks.value.add(hook)
    return () => {
      shouldUpdateViewHooks.value.delete(hook)
    }
  }

  function shouldUpdateView() {
    post({ type: 'spine-should-update-view' })
    shouldUpdateViewHooks.value.forEach(hook => hook())
  }

  watch(data, (event) => {
    if (event?.type === 'spine-should-update-view') {
      shouldUpdateViewHooks.value.forEach(hook => hook())
    }
  })

  /** Currently active idle animation (track 0). */
  const currentAnimation = useLocalStorageManualReset<SpineCurrentAnimation>(
    'settings/spine/current-animation',
    () => ({ ...defaultSpineAnimation }),
  )

  /** All animations discovered on the loaded skeleton. */
  const availableAnimations = useLocalStorageManualReset<SpineAnimationDescriptor[]>(
    'settings/spine/available-animations',
    () => [],
  )

  /** All skins discovered on the loaded skeleton. */
  const availableSkins = useLocalStorageManualReset<SpineSkinDescriptor[]>(
    'settings/spine/available-skins',
    () => [],
  )

  /** Active skin name. Empty string means use the model's default skin. */
  const currentSkin = useLocalStorageManualReset<string>('settings/spine/current-skin', '')

  /** All skeleton variants discovered in the ZIP. */
  const availableVariants = useLocalStorageManualReset<SpineVariantDescriptor[]>(
    'settings/spine/available-variants',
    () => [],
  )

  /** Active variant name. Empty string means use the default (first) variant. */
  const currentVariant = useLocalStorageManualReset<string>('settings/spine/current-variant', '')

  /** Premultiplied alpha — most modern Spine atlases ship as PMA. */
  const premultipliedAlpha = useLocalStorageManualReset<boolean>('settings/spine/premultiplied-alpha', true)

  /** Default mix-in/out duration (s) between track animations. */
  const defaultMixDuration = useLocalStorageManualReset<number>('settings/spine/default-mix', 0.2)

  /** Auto-play idle animation on load. */
  const idleAnimationEnabled = useLocalStorageManualReset<boolean>('settings/spine/idle-enabled', true)

  /** Animation playback speed multiplier (1.0 = normal). */
  const animationSpeed = useLocalStorageManualReset<number>('settings/spine/animation-speed', 1)

  /** Maximum FPS for the WebGL render loop (0 = uncapped). */
  const maxFps = useLocalStorageManualReset<number>('settings/spine/max-fps', 0)

  const { position, scale, reset: resetViewControl } = useSpineViewControl()

  function resetState() {
    supportedControl.forEach(c => resetViewControl(c))
    currentAnimation.reset()
    availableAnimations.reset()
    availableSkins.reset()
    currentSkin.reset()
    availableVariants.reset()
    currentVariant.reset()
    premultipliedAlpha.reset()
    defaultMixDuration.reset()
    idleAnimationEnabled.reset()
    animationSpeed.reset()
    maxFps.reset()
    shouldUpdateView()
  }

  return {
    position,
    scale,
    currentAnimation,
    availableAnimations,
    availableSkins,
    currentSkin,
    availableVariants,
    currentVariant,
    premultipliedAlpha,
    defaultMixDuration,
    idleAnimationEnabled,
    animationSpeed,
    maxFps,

    onShouldUpdateView,
    shouldUpdateView,
    resetState,
  }
})

export { useSpineViewControl }
