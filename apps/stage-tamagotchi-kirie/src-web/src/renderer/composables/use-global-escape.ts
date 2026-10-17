import type { MaybeRefOrGetter } from 'vue'

import { errorMessageFrom } from '@moeru/std'
import { getHostEventaContext, useHostEventaInvoke, useHostGlobalShortcuts } from '@proj-airi/stage-host-context'
import { onScopeDispose, toValue, watch } from 'vue'

import { inlayEscape, inlayWatchEscape } from '../../shared/inlay'

/** Registers Escape only while this window presents speech. Local key handling remains in the shared component. */
export function useGlobalEscape(id: string, active: MaybeRefOrGetter<boolean>, onEscape: () => void) {
  const shortcuts = useHostGlobalShortcuts()
  const watchEscape = useHostEventaInvoke(inlayWatchEscape)
  let disposed = false
  let pending = Promise.resolve()

  async function apply() {
    await shortcuts.unregister(id)
    const enabled = !disposed && toValue(active)
    const observedNatively = await watchEscape({ enabled })
    if (!enabled || observedNatively)
      return
    const result = await shortcuts.register({ id, accelerator: { modifiers: [], key: 'Escape' }, scope: 'global', receiveKeyUps: true, description: 'Dismiss voice input' })
    if (!result.ok)
      throw new Error(`Escape registration failed: ${result.reason}`)
  }

  function schedule() {
    pending = pending.then(apply).catch((error) => {
      console.error('[voice-inlay] Native Escape registration failed:', errorMessageFrom(error))
    })
  }

  watch(() => toValue(active), schedule, { immediate: true })
  const stop = shortcuts.onTriggered((event) => {
    if (event.id === id && event.phase === 'down')
      onEscape()
  })
  const stopNativeEscape = getHostEventaContext().on(inlayEscape, onEscape)
  onScopeDispose(() => {
    disposed = true
    stop()
    stopNativeEscape()
    schedule()
  })
}
