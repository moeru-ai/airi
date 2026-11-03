import type { ShortcutAccelerator, ShortcutFailureReason } from '@proj-airi/stage-shared/global-shortcut'
import type { ShortcutTryEvent } from '@proj-airi/stage-ui/stores/device-permissions'

import { errorMessageFrom } from '@moeru/std'
import { getElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { isSameKeyCombination, ShortcutFailureReasons } from '@proj-airi/stage-shared/global-shortcut'
import { useVoicePushToTalk } from '@proj-airi/stage-ui/composables/voice-input-mode'
import { useLocalStorage } from '@vueuse/core'
import { isMacOS } from 'std-env'
import { onScopeDispose, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { electronShortcutList, electronShortcutRegister, electronShortcutTriggered, electronShortcutUnregister } from '../../shared/eventa'
import { isSafeSpotlightAccelerator } from '../../shared/spotlight-shortcut'
import { acceleratorFromKeyboardEvent } from '../utils/shortcut-recording'

/** Stable binding ID. A changed accelerator keeps this ID, so the main process replaces the earlier binding. */
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
    await unregister({ id: PUSH_TO_TALK_SHORTCUT_ID })
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

  // Rebinding drops the pressed state of the old uiohook entry, so the old key up never arrives and the input never ends.
  // This watcher runs before the registration watcher. `useVoiceHold` cancels on disable.
  watch(accelerator, () => hold.cancel('Push to Talk shortcut changed during the hold'), { deep: true })
  watch([hold.enabled, accelerator], scheduleRegistration, { immediate: true, deep: true })

  const stopTrigger = getElectronEventaContext().on(electronShortcutTriggered, ({ body }) => {
    // The main process sends every global shortcut to each registered window. Other IDs belong to other features.
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

/** The binding ID of the onboarding try. It differs from the real binding, so a try never drives the voice host. */
export const PUSH_TO_TALK_TRY_SHORTCUT_ID = 'voice-push-to-talk-try'

/**
 * Returns a function that lets the user try the Push to Talk keys, for the onboarding permissions step.
 *
 * - With Accessibility, it registers a global binding of the same keys, so a press in any app reports `every-app`.
 *   When the stage window already holds the keys for Push to Talk, it reports the triggers of that binding instead.
 * - Without Accessibility, or when another shortcut holds the keys, only key events of this window report, as `this-app`.
 *   A registration without Accessibility would show the macOS prompt, so the try does not register then.
 *
 * The returned function stops the try and removes its binding.
 */
export function usePushToTalkTry(isTrusted: () => Promise<boolean>) {
  const { accelerator } = usePushToTalkShortcutSettings()
  const register = useElectronEventaInvoke(electronShortcutRegister)
  const unregister = useElectronEventaInvoke(electronShortcutUnregister)
  const listShortcuts = useElectronEventaInvoke(electronShortcutList)
  /**
   * Registrations and removals of the try binding run in order. A page starts a new try when the status changes, and
   * the removal of the earlier try must not land after the registration of the next one, because both use one ID.
   */
  let queue = Promise.resolve()
  function enqueue(task: () => Promise<void>) {
    queue = queue.then(task).catch(error => console.error('[push-to-talk] Shortcut try failed:', errorMessageFrom(error)))
  }

  return (listener: (event: ShortcutTryEvent) => void) => {
    const binding = { modifiers: [...accelerator.value.modifiers], key: accelerator.value.key }
    /** The binding whose triggers come from the global hook. While it is set, key events of this window do not report. */
    let globalId: string | undefined
    let ownsBinding = false
    let stopped = false
    let localDown = false

    function onKeyDown(event: KeyboardEvent) {
      if (globalId)
        return
      const pressed = acceleratorFromKeyboardEvent(event)
      if (!pressed || !isSameKeyCombination(pressed, binding, { isMacOS }))
        return
      event.preventDefault()
      localDown = true
      listener({ phase: 'down', reach: 'this-app' })
    }

    function onKeyUp(event: KeyboardEvent) {
      // Letting go of the main key or of any modifier ends the hold, as the global hook does.
      if (!localDown || (event.code !== binding.key && !['Alt', 'Control', 'Meta', 'Shift'].includes(event.key)))
        return
      localDown = false
      listener({ phase: 'up', reach: 'this-app' })
    }

    function onBlur() {
      if (!localDown)
        return
      localDown = false
      listener({ phase: 'up', reach: 'this-app' })
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    const stopTrigger = getElectronEventaContext().on(electronShortcutTriggered, ({ body }) => {
      if (!body || !globalId || body.id !== globalId)
        return
      localDown = false
      listener({ phase: body.phase, reach: 'every-app' })
    })

    async function registerGlobal() {
      if (stopped || !await isTrusted())
        return
      // A reloaded window can leave its earlier try binding in the main process.
      await unregister({ id: PUSH_TO_TALK_TRY_SHORTCUT_ID })
      const result = await register({ id: PUSH_TO_TALK_TRY_SHORTCUT_ID, accelerator: binding, scope: 'global', receiveKeyUps: true, description: 'Push to Talk try' })
      if (result.ok) {
        ownsBinding = true
        globalId = PUSH_TO_TALK_TRY_SHORTCUT_ID
        return
      }
      if (result.reason !== ShortcutFailureReasons.Conflict)
        return
      const holder = (await listShortcuts()).find(item => isSameKeyCombination(item.accelerator, binding, { isMacOS }))
      if (!stopped && holder?.id === PUSH_TO_TALK_SHORTCUT_ID)
        globalId = PUSH_TO_TALK_SHORTCUT_ID
    }

    enqueue(registerGlobal)

    return () => {
      stopped = true
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      stopTrigger()
      enqueue(async () => {
        if (ownsBinding)
          await unregister({ id: PUSH_TO_TALK_TRY_SHORTCUT_ID })
      })
    }
  }
}
