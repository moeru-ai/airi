import type { ShortcutAccelerator, ShortcutFailureReason } from '@proj-airi/stage-shared/global-shortcut'
import type { Ref } from 'vue'

import { getElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { formatAccelerator, ShortcutFailureReasons } from '@proj-airi/stage-shared/global-shortcut'
import { useLocalStorage } from '@vueuse/core'
import { onMounted, onUnmounted, shallowRef, watch } from 'vue'

import { electronShortcutRegister, electronShortcutTriggered, electronShortcutUnregister } from '../../shared/eventa'

const SHORTCUT_ID = 'voice-push-to-talk'
const STORAGE_KEY = 'settings/audio/input/push-to-talk-shortcut'
const ERROR_STORAGE_KEY = 'settings/audio/input/push-to-talk-shortcut-error'
export const DEFAULT_PUSH_TO_TALK_SHORTCUT: ShortcutAccelerator = { modifiers: ['ctrl', 'alt'], key: 'Space' }

/** Shares the configurable desktop shortcut between settings and the stage window. */
export function useDesktopPushToTalkShortcut() {
  return useLocalStorage<ShortcutAccelerator>(STORAGE_KEY, DEFAULT_PUSH_TO_TALK_SHORTCUT, { listenToStorageChanges: true })
}

export function useDesktopPushToTalkShortcutError() {
  return useLocalStorage<ShortcutFailureReason | null>(ERROR_STORAGE_KEY, null, { listenToStorageChanges: true })
}

/**
 * Owns the global hold binding while the desktop stage is active.
 * The existing shortcut service reports unsupported key-up delivery as a registration error.
 */
export function useDesktopPushToTalk(options: {
  begin: (isHeld: () => boolean) => Promise<void>
  end: () => Promise<void>
  enabled?: Ref<boolean>
}) {
  const accelerator = useDesktopPushToTalkShortcut()
  const register = useElectronEventaInvoke(electronShortcutRegister)
  const unregister = useElectronEventaInvoke(electronShortcutUnregister)
  const registrationError = useDesktopPushToTalkShortcutError()
  const isHeld = shallowRef(false)
  let disposed = false
  let generation = 0
  let registered = false
  let pendingBind = Promise.resolve()
  let pendingRelease = Promise.resolve()
  let activeHold: { active: boolean, beginPromise: Promise<void>, didBegin: boolean } | undefined
  let stopWatch: (() => void) | undefined
  let stopEvents: (() => void) | undefined

  async function release() {
    const hold = activeHold
    if (!hold?.active)
      return
    hold.active = false
    isHeld.value = false
    // Release must reach microphone startup cancellation before permission resolves.
    const ending = hold.didBegin ? options.end() : Promise.resolve()
    pendingRelease = Promise.all([hold.beginPromise, ending]).then(() => {}).catch((error) => {
      console.error('[Push to Talk] Could not stop recording:', error)
    })
    await pendingRelease
    if (activeHold === hold)
      activeHold = undefined
  }

  async function bind() {
    const current = ++generation
    if (registered) {
      registered = false
      await unregister({ id: SHORTCUT_ID })
    }
    if (disposed || current !== generation || options.enabled?.value === false) {
      registrationError.value = null
      void release()
      return
    }

    const result = await register({
      id: SHORTCUT_ID,
      accelerator: accelerator.value,
      description: 'Push to Talk',
      scope: 'global',
      receiveKeyUps: true,
    })
    if (disposed || current !== generation) {
      if (result.ok)
        await unregister({ id: SHORTCUT_ID })
      return
    }
    registered = result.ok
    registrationError.value = result.ok ? null : result.reason
  }

  function scheduleBind() {
    if (options.enabled?.value === false)
      void release()
    // A rebind must wait for the previous registration result. Otherwise two
    // concurrent invokes can both claim the same stable shortcut ID.
    pendingBind = pendingBind.then(bind).catch(() => {
      registrationError.value = ShortcutFailureReasons.Unsupported
    })
  }

  onMounted(() => {
    const context = getElectronEventaContext()
    stopEvents = context.on(electronShortcutTriggered, (event) => {
      const payload = event.body
      if (!payload || payload.id !== SHORTCUT_ID || options.enabled?.value === false)
        return
      if (payload.phase === 'down') {
        if (isHeld.value)
          return
        isHeld.value = true
        const hold = { active: true, beginPromise: Promise.resolve(), didBegin: false }
        activeHold = hold
        hold.beginPromise = pendingRelease.then(async () => {
          if (hold.active) {
            hold.didBegin = true
            await options.begin(() => hold.active)
          }
        }).catch((error) => {
          console.error('[Push to Talk] Could not start recording:', error)
        })
      }
      else {
        void release()
      }
    })
    stopWatch = watch(
      [accelerator, () => options.enabled?.value ?? true],
      scheduleBind,
      { immediate: true, deep: true },
    )
  })

  onUnmounted(() => {
    disposed = true
    generation++
    stopWatch?.()
    stopEvents?.()
    void release()
    if (registered)
      void unregister({ id: SHORTCUT_ID })
  })

  return { accelerator, isHeld, registrationError, shortcutLabel: () => formatAccelerator(accelerator.value) }
}
