import type { ShortcutAccelerator, ShortcutFailureReason } from '@proj-airi/stage-shared/global-shortcut'

import { errorMessageFrom } from '@moeru/std'
import { useHostGlobalShortcuts } from '@proj-airi/stage-host-context'
import { ShortcutFailureReasons } from '@proj-airi/stage-shared/global-shortcut'
import { useVoicePushToTalk } from '@proj-airi/stage-ui/composables/voice-input-mode'
import { useLocalStorage } from '@vueuse/core'
import { onScopeDispose, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { isSafeSpotlightAccelerator } from '../../shared/spotlight-shortcut'

/** Stable binding ID. A changed accelerator keeps this ID, so the host replaces the earlier binding. */
export const PUSH_TO_TALK_SHORTCUT_ID = 'voice-push-to-talk'

/** Returns the default hold shortcut. Ctrl+Shift+Space has no default system meaning on macOS, Windows, or common Linux desktops. */
export function defaultPushToTalkAccelerator(): ShortcutAccelerator {
  return { modifiers: ['ctrl', 'shift'], key: 'Space' }
}

/**
 * Tells if an accelerator can be a global hold key.
 * The global hook observes keys in every app and does not consume them, so a key that occurs in ordinary typing starts
 * Push to Talk while the user types. Shift alone is not enough, because Shift+A and Shift+Space occur in ordinary typing.
 * Cmd, Ctrl, Alt, or Super prevents that, and so does a function key.
 */
export function isHoldableAccelerator(accelerator: ShortcutAccelerator) {
  return isSafeSpotlightAccelerator(accelerator) || /^F\d{1,2}$/.test(accelerator.key)
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
 * Key up ends it. The global shortcut driver in the host process delivers both phases.
 * Scope disposal cancels a running hold and removes the registration.
 */
export function usePushToTalkShortcut() {
  const { t } = useI18n()
  const { accelerator, registrationError } = usePushToTalkShortcutSettings()
  const { register, unregister, onTriggered } = useHostGlobalShortcuts()
  const hold = useVoicePushToTalk({
    onUnconfigured: () => toast(t('stage.chat.voice-composer.configure-title'), { description: t('stage.chat.voice-composer.configure-description') }),
  })
  let disposed = false
  /** Registration changes run in order. Two concurrent registrations for one ID fail with `duplicate-id`. */
  let pending = Promise.resolve()

  async function applyRegistration() {
    // A reloaded renderer can leave its earlier binding in the host process. Removing it first makes registration idempotent.
    await unregister(PUSH_TO_TALK_SHORTCUT_ID)
    if (disposed || !hold.enabled.value) {
      registrationError.value = ''
      return
    }

    // IPC uses structured cloning, which rejects the reactive proxy of the stored value.
    const binding = { modifiers: [...accelerator.value.modifiers], key: accelerator.value.key }
    const result = await register({ id: PUSH_TO_TALK_SHORTCUT_ID, accelerator: binding, scope: 'global', receiveKeyUps: true, description: 'Push to Talk' })
    registrationError.value = result.ok ? '' : result.reason
  }

  function scheduleRegistration() {
    pending = pending.then(applyRegistration).catch((error) => {
      console.error('[push-to-talk] Shortcut registration failed:', errorMessageFrom(error))
      registrationError.value = ShortcutFailureReasons.Unsupported
    })
  }

  // Rebinding drops the pressed state of the old shortcut entry, so the old key up never arrives and the input never ends.
  // This watcher runs before the registration watcher. `useVoiceHold` cancels on disable.
  watch(accelerator, () => hold.cancel('Push to Talk shortcut changed during the hold'), { deep: true })
  watch([hold.enabled, accelerator], scheduleRegistration, { immediate: true, deep: true })

  const stopTrigger = onTriggered((body) => {
    // The host sends every global shortcut to each registered listener. Other IDs belong to other features.
    if (body?.id !== PUSH_TO_TALK_SHORTCUT_ID)
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
