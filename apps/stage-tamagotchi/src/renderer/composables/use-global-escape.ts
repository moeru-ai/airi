import type { MaybeRefOrGetter } from 'vue'

import { errorMessageFrom } from '@moeru/std'
import { getElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { onScopeDispose, toValue, watch } from 'vue'

import { electronShortcutRegister, electronShortcutTriggered, electronShortcutUnregister } from '../../shared/eventa'

/**
 * Calls `onEscape` when the user presses Escape in any app, while `active` is true.
 *
 * The binding uses the uiohook driver, which observes keys without consuming them. The focused app still receives
 * its Escape, and AIRI reacts to the same press. An Electron accelerator would take Escape away from every other app.
 * The binding exists only while `active` is true, so Escape costs nothing when AIRI shows nothing.
 *
 * Without the macOS Accessibility permission, or on native Wayland, registration fails and nothing happens.
 * The caller keeps its own window `keydown` handler for that case.
 *
 * @param id Stable binding ID. Each window that calls this needs its own ID, because the main process sends every
 *   trigger to every registered window.
 */
export function useGlobalEscape(id: string, active: MaybeRefOrGetter<boolean>, onEscape: () => void) {
  const register = useElectronEventaInvoke(electronShortcutRegister)
  const unregister = useElectronEventaInvoke(electronShortcutUnregister)
  let disposed = false
  /** Registration changes run in order. Two concurrent registrations for one ID would fail with `duplicate-id`. */
  let pending = Promise.resolve()

  async function apply() {
    // A reloaded renderer can leave its earlier binding in the main process. Removing it first makes registration idempotent.
    await unregister({ id })
    if (disposed || !toValue(active))
      return
    await register({ id, accelerator: { modifiers: [], key: 'Escape' }, scope: 'global', receiveKeyUps: true, description: 'Dismiss voice input' })
  }

  function schedule() {
    pending = pending.then(apply).catch((error) => {
      console.error(`[global-escape] Registration of "${id}" failed:`, errorMessageFrom(error))
    })
  }

  watch(() => toValue(active), schedule, { immediate: true })

  const stopTrigger = getElectronEventaContext().on(electronShortcutTriggered, ({ body }) => {
    // Other IDs belong to other features. The key up of this binding carries no action.
    if (body?.id === id && body.phase === 'down')
      onEscape()
  })

  onScopeDispose(() => {
    disposed = true
    stopTrigger()
    schedule()
  })
}
