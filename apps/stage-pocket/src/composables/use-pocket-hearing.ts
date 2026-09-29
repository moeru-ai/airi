import type { PluginListenerHandle } from '@capacitor/core'

import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useStageHearing } from '@proj-airi/stage-ui/composables/use-stage-hearing'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings/audio-device'
import { computed, onMounted, onScopeDispose, shallowRef } from 'vue'

/** Optional host acknowledgements keep native capture outside the foreground package. */
export interface PocketHearingOptions {
  /** Resolves after the host releases its microphone. WebView capture starts afterward. */
  beforeResume?: () => Promise<void>
  /** Runs after the WebView stops all microphone tracks. The host can then capture. */
  afterPause?: () => Promise<void>
}

let currentOwner: symbol | undefined

/** Releases the WebView microphone while Pocket is outside the foreground. */
export function usePocketHearing(options: PocketHearingOptions = {}) {
  const owner = Symbol('pocket-hearing')
  currentOwner = owner
  const active = shallowRef(false)
  const device = useSettingsAudioDevice()
  device.setContinuousInputSuspended(true)
  device.stopStream()
  const onError = (error: unknown) => console.error('Pocket hearing failed:', error)
  const hearing = useStageHearing({
    consumerId: `stage-pocket:hearing:${crypto.randomUUID()}`,
    suspended: () => !active.value,
    onError,
  })

  let disposed = false
  let generation = 0
  const listeners: PluginListenerHandle[] = []
  let transition = Promise.resolve()

  function isCurrent(ticket = generation) {
    return !disposed && currentOwner === owner && ticket === generation
  }

  function setActive(next: boolean) {
    const ticket = ++generation
    // Keep the runtime suspended until the host acknowledges its microphone release.
    active.value = false
    if (currentOwner === owner) {
      device.setContinuousInputSuspended(true)
      device.stopStream()
    }
    transition = transition.catch(onError).then(async () => {
      if (!isCurrent(ticket))
        return
      if (!next) {
        await hearing.pause()
        if (isCurrent(ticket))
          await options.afterPause?.()
        return
      }
      await options.beforeResume?.()
      if (!isCurrent(ticket))
        return
      device.setContinuousInputSuspended(false)
      active.value = true
      await hearing.resume()
    })
    void transition.catch(onError)
    return transition
  }

  /** Notification handoff waits for the current foreground transition. */
  async function armWake(cardId: string) {
    await transition
    if (!isCurrent() || !active.value)
      return false
    return await hearing.armWake(cardId)
  }

  async function keepListener(pending: Promise<PluginListenerHandle>) {
    const listener = await pending
    if (disposed)
      await listener.remove()
    else
      listeners.push(listener)
  }

  onMounted(async () => {
    try {
      if (!Capacitor.isNativePlatform()) {
        await setActive(true)
        return
      }
      // Android appStateChange(false) arrives at onStop. Pause releases tracks at onPause.
      await keepListener(App.addListener('pause', () => {
        void setActive(false).catch(onError)
      }))
      await keepListener(App.addListener('appStateChange', ({ isActive }) => {
        void setActive(isActive).catch(onError)
      }))
      const ticket = generation
      const state = await App.getState()
      if (isCurrent(ticket))
        await setActive(state.isActive)
    }
    catch (error) {
      onError(error)
    }
  })

  onScopeDispose(() => {
    disposed = true
    generation++
    active.value = false
    if (currentOwner === owner) {
      currentOwner = undefined
      device.setContinuousInputSuspended(true)
      device.stopStream()
    }
    // Each runtime has its own consumer ID. Old cleanup cannot remove the next instance's consumer.
    void hearing.pause().catch(onError)
    for (const listener of listeners)
      void listener.remove().catch(onError)
  })

  const ready = computed(() => active.value && hearing.preparation.value === 'ready')
  return { active, ready, armWake }
}
