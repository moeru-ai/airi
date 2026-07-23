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

/** Transient request to play a one-shot animation on the emotion track. */
export interface SpineOneShotAnimation {
  /** Animation name; resolved against the loaded skeleton by the scene. */
  name: string
  /** Whether the one-shot should loop instead of reverting to idle. */
  loop: boolean
  /** Bumped on every request so repeat calls with the same name re-trigger. */
  nonce: number
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

  /** Animation playback speed multiplier (1.0 = normal). */
  const animationSpeed = useLocalStorageManualReset<number>('settings/spine/animation-speed', 1)

  // NOTICE:
  // Premultiplied-alpha, default-mix, idle-enabled, and max-fps live in
  // `useSettingsSpine` (packages/stage-ui/src/stores/settings/spine.ts) and
  // are bound to the same `settings/spine/*` keys. They used to be declared
  // here too, which created two refs per key and two competing sources of
  // truth. Stage, the preview, and the settings panel all read the
  // `useSettingsSpine` copies, so the duplicates were removed from this store.
  // Removal condition: keep these settings owned by a single store.

  /**
   * Whether a Spine skeleton is currently mounted in a live scene.
   *
   * Runtime-only and never persisted: `availableAnimations` survives reloads
   * via localStorage, so it cannot tell tools whether a model is actually on
   * screen. The scene sets this on mount and clears it on dispose/unmount.
   */
  const isModelLoaded = ref(false)

  /**
   * Transient one-shot animation request. The scene watches this and layers
   * the animation on the emotion track over the persistent idle loop. Not
   * persisted — it is a fire-and-forget trigger rather than durable state.
   */
  const oneShotAnimation = ref<SpineOneShotAnimation>()

  /** Queue a one-shot animation; bumps the nonce so repeat calls re-trigger. */
  function playOneShotAnimation(name: string, loop = false) {
    oneShotAnimation.value = { name, loop, nonce: (oneShotAnimation.value?.nonce ?? 0) + 1 }
  }

  const { position, scale, reset: resetViewControl } = useSpineViewControl()

  function resetState() {
    supportedControl.forEach(c => resetViewControl(c))
    currentAnimation.reset()
    availableAnimations.reset()
    availableSkins.reset()
    currentSkin.reset()
    availableVariants.reset()
    currentVariant.reset()
    animationSpeed.reset()
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
    animationSpeed,

    isModelLoaded,
    oneShotAnimation,
    playOneShotAnimation,

    onShouldUpdateView,
    shouldUpdateView,
    resetState,
  }
})

export { useSpineViewControl }
