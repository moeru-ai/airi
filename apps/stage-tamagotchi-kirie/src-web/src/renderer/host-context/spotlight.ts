import type { GlobalShortcut } from '@gd-kirie/platform'
import type { ShortcutAccelerator, ShortcutRegistrationResult } from '@proj-airi/stage-shared/global-shortcut'

import { notificationActivated } from '@gd-kirie/platform'
import { defineInvoke, defineInvokeEventa } from '@moeru/eventa'

import {
  airiSpotlightShortcutChanged,
  electronSpotlightHide,
  electronSpotlightOpen,
  electronSpotlightShortcutGet,
  electronSpotlightShortcutSet,
} from '../../shared/eventa'
import { useHostChat } from './chat'
import { toKirieGlobalShortcut } from './global-shortcuts'
import { initializeHostContext } from './owner'

type EmptyPayload = Record<string, never>

const sendSuffix = '-send'
const kirieSpotlightHide = defineInvokeEventa<EmptyPayload, EmptyPayload>(
  electronSpotlightHide.sendEvent.id.slice(0, -sendSuffix.length),
)
const kirieSpotlightOpen = defineInvokeEventa<EmptyPayload, EmptyPayload>(
  electronSpotlightOpen.sendEvent.id.slice(0, -sendSuffix.length),
)
const kirieSpotlightShortcutGet = defineInvokeEventa<ShortcutAccelerator, EmptyPayload>(
  electronSpotlightShortcutGet.sendEvent.id.slice(0, -sendSuffix.length),
)

export function useHostSpotlightWindow() {
  const host = initializeHostContext()
  const openChat = useHostChat()
  const hide = defineInvoke(host.context, kirieSpotlightHide)
  const pendingNotificationIds = new Set<string>()
  const stopActivated = host.context.on(notificationActivated, ({ body }) => {
    if (!body || !pendingNotificationIds.delete(body.id))
      return

    openChat()
  })

  return {
    async hide() {
      await hide({})
    },
    async showResultNotification(body: string) {
      const id = `spotlight-result-${crypto.randomUUID()}`
      pendingNotificationIds.add(id)
      try {
        await host.platform.notifications.show({
          body,
          id,
          title: 'AIRI',
        })
      }
      catch (error) {
        pendingNotificationIds.delete(id)
        if (pendingNotificationIds.size === 0)
          stopActivated()
        throw error
      }
    },
  }
}

export function useHostSpotlightShortcut() {
  const host = initializeHostContext()
  const getShortcut = defineInvoke(host.context, kirieSpotlightShortcutGet)
  const setShortcut = defineInvoke(host.context, electronSpotlightShortcutSet)
  return {
    get: () => getShortcut({}),
    set: (accelerator: ShortcutAccelerator | null): Promise<ShortcutRegistrationResult> =>
      setShortcut({ accelerator }),
  }
}

/**
 * Registers the Spotlight OS shortcut on the main renderer through Kirie
 * Platform. This path stays outside the GAP-008 renderer-owned map so
 * `unregisterAll` cannot drop it. The returned function releases the
 * registration, and `beforeunload` releases it as well, because a renderer reload
 * replaces the page that owns the key callback while the host keeps the entry.
 */
export function startHostOwnedSpotlightShortcut(
  options?: { onRegistrationFailed?: (error: unknown) => void },
): () => void {
  const host = initializeHostContext()
  const shortcuts = useHostSpotlightShortcut()
  const openSpotlight = defineInvoke(host.context, kirieSpotlightOpen)
  let current: GlobalShortcut | undefined
  let stopped = false

  async function bind(accelerator: ShortcutAccelerator) {
    if (stopped)
      return

    const shortcut = toKirieGlobalShortcut(accelerator)
    if (!shortcut) {
      options?.onRegistrationFailed?.(new Error('The Spotlight accelerator is invalid.'))
      return
    }

    if (current) {
      await host.platform.globalShortcuts.unregister(current)
      current = undefined
    }

    try {
      await host.platform.globalShortcuts.register(shortcut, (event) => {
        if (event.state === 'pressed')
          openSpotlight({})
      })
      current = shortcut
    }
    catch (error) {
      options?.onRegistrationFailed?.(error)
    }
  }

  const stopListening = host.context.on(airiSpotlightShortcutChanged, ({ body }) => {
    if (body)
      bind(body)
  })

  shortcuts.get().then(bind).catch((error) => {
    options?.onRegistrationFailed?.(error)
  })

  const stop = () => {
    stopped = true
    globalThis.removeEventListener('beforeunload', stop)
    stopListening()
    if (!current)
      return

    const shortcut = current
    current = undefined
    host.platform.globalShortcuts.unregister(shortcut).catch((error) => {
      console.warn('[spotlight] Failed to unregister the host-owned shortcut:', error)
    })
  }

  // NOTICE:
  // Release registrations before reload to prevent duplicate shortcuts and stale callbacks.
  // GdKiriePlatformHost retains page callbacks. CEF reload emits only beforeunload.
  // Context: apps/stage-tamagotchi-kirie/docs/host-architecture.md, Spotlight and permissions.
  // Remove when Kirie releases registrations with their renderer context.
  globalThis.addEventListener('beforeunload', stop, { once: true })

  return stop
}
