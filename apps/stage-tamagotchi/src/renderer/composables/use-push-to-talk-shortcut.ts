import type { ShortcutAccelerator, ShortcutFailureReason } from '@proj-airi/stage-shared/global-shortcut'

import { errorMessageFrom } from '@moeru/std'
import { getElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { ShortcutFailureReasons } from '@proj-airi/stage-shared/global-shortcut'
import { useVoicePushToTalk } from '@proj-airi/stage-ui/composables/voice-input-mode'
import { useLocalStorage } from '@vueuse/core'
import { onScopeDispose, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { electronShortcutRegister, electronShortcutTriggered, electronShortcutUnregister } from '../../shared/eventa'

/** Stable binding ID. A changed accelerator keeps this ID, so the main process replaces the earlier binding. */
const SHORTCUT_ID = 'voice-push-to-talk'

/** Returns the default hold shortcut. Ctrl+Shift+Space has no default system meaning on macOS, Windows, or common Linux desktops. */
export function defaultPushToTalkAccelerator(): ShortcutAccelerator {
  return { modifiers: ['ctrl', 'shift'], key: 'Space' }
}

/**
 * Tells if an accelerator can be a global hold key.
 * The global hook observes keys in every app and does not consume them, so a plain letter would start Push to Talk while the user types.
 * A modifier or a function key prevents that.
 */
export function isHoldableAccelerator(accelerator: ShortcutAccelerator) {
  return accelerator.modifiers.length > 0 || /^F\d{1,2}$/.test(accelerator.key)
}

/**
 * Push to Talk shortcut settings that the settings window edits and the stage window applies.
 *
 * Both windows share one origin, so localStorage events carry each change to the other window.
 * `registrationError` is the latest result of the stage window. An empty string means that the shortcut is registered or not needed.
 */
export function usePushToTalkShortcutSettings() {
  return {
    accelerator: useLocalStorage<ShortcutAccelerator>('settings/hearing/push-to-talk-shortcut', defaultPushToTalkAccelerator()),
    registrationError: useLocalStorage<ShortcutFailureReason | ''>('settings/hearing/push-to-talk-shortcut-error', ''),
  }
}

/**
 * Registers the global Push to Talk hold shortcut while the Hearing input mode is `push-to-talk`, and drives the voice host with it.
 *
 * Call it once in the stage window, which owns the voice host. Key down begins a speech input for the active session.
 * Key up ends it. The uiohook driver in the main process delivers both phases and suppresses key repeats.
 * Scope disposal cancels a running hold and removes the registration.
 */
export function usePushToTalkShortcut() {
  const { t } = useI18n()
  const { accelerator, registrationError } = usePushToTalkShortcutSettings()
  const register = useElectronEventaInvoke(electronShortcutRegister)
  const unregister = useElectronEventaInvoke(electronShortcutUnregister)
  const hold = useVoicePushToTalk({
    onUnconfigured: () => toast(t('stage.chat.voice-composer.configure-title'), { description: t('stage.chat.voice-composer.configure-description') }),
  })
  let disposed = false
  /** Registration changes run in order. Two concurrent registrations for one ID would fail with `duplicate-id`. */
  let pending = Promise.resolve()

  async function applyRegistration() {
    // A reloaded renderer can leave its earlier binding in the main process. Removing it first makes registration idempotent.
    await unregister({ id: SHORTCUT_ID })
    if (disposed || !hold.enabled.value) {
      registrationError.value = ''
      return
    }

    // IPC uses structured cloning, which rejects the reactive proxy of the stored value.
    const binding = { modifiers: [...accelerator.value.modifiers], key: accelerator.value.key }
    const result = await register({ id: SHORTCUT_ID, accelerator: binding, scope: 'global', receiveKeyUps: true, description: 'Push to Talk' })
    registrationError.value = result.ok ? '' : result.reason
  }

  function scheduleRegistration() {
    pending = pending.then(applyRegistration).catch((error) => {
      console.error('[push-to-talk] Shortcut registration failed:', errorMessageFrom(error))
      registrationError.value = ShortcutFailureReasons.Unsupported
    })
  }

  watch([hold.enabled, accelerator], scheduleRegistration, { immediate: true, deep: true })

  const stopTrigger = getElectronEventaContext().on(electronShortcutTriggered, ({ body }) => {
    // The main process sends every global shortcut to each registered window. Other IDs belong to other features.
    if (body?.id !== SHORTCUT_ID)
      return
    if (body.phase === 'down')
      hold.press()
    else
      hold.release()
  })

  onScopeDispose(() => {
    disposed = true
    stopTrigger()
    scheduleRegistration()
  })

  return hold
}
