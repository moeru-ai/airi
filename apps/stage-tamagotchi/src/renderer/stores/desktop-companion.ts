import type { DesktopCapabilities, DesktopCompanionSnapshot, DesktopCursorSample, DesktopNotificationInput, DesktopPreferences } from '../../shared/desktop-companion'

import { defineInvoke } from '@moeru/eventa'
import { getElectronEventaContext } from '@proj-airi/electron-vueuse'
import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, shallowRef } from 'vue'

import { defaultDesktopPreferences } from '../../shared/desktop-companion'
import {
  desktopCapabilitiesChanged,
  desktopCapabilitiesGet,
  desktopCompanionChanged,
  desktopCompanionGet,
  desktopCompanionSetPreferences,
  desktopCursorSample,
  desktopNotificationClear,
  desktopNotificationPublish,
  desktopNotificationRead,
} from '../../shared/eventa/desktop-companion'

/** Main owns persistence. This renderer subscribes before hydration and rejects older snapshots. */
export const useDesktopCompanionStore = defineStore('desktop-companion', () => {
  const context = getElectronEventaContext()
  const snapshot = shallowRef<DesktopCompanionSnapshot>({
    preferences: defaultDesktopPreferences(),
    notifications: [],
    unreadCount: 0,
    archivedUnreadCount: 0,
    nativeSupported: false,
    persistence: 'ready',
    revision: -1,
  })
  const capabilities = shallowRef<DesktopCapabilities>()
  const cursor = shallowRef<DesktopCursorSample | null>(null)
  const loadFailed = ref(false)
  const ready = computed(() => snapshot.value.revision >= 0)
  const preferences = computed(() => snapshot.value.preferences)

  function apply(value: DesktopCompanionSnapshot) {
    if (value.revision >= snapshot.value.revision)
      snapshot.value = value
  }
  function applyCapabilities(value: DesktopCapabilities) {
    if (!capabilities.value || value.layoutRevision >= capabilities.value.layoutRevision) {
      capabilities.value = value
      if (cursor.value && cursor.value.layoutRevision !== value.layoutRevision)
        cursor.value = null
    }
  }

  const cleanups = [
    context.on(desktopCompanionChanged, ({ body }) => {
      if (body)
        apply(body)
    }),
    context.on(desktopCapabilitiesChanged, ({ body }) => {
      if (body)
        applyCapabilities(body)
    }),
    context.on(desktopCursorSample, ({ body }) => {
      if (!body || !capabilities.value || body.layoutRevision === capabilities.value.layoutRevision)
        cursor.value = body ?? null
    }),
  ]
  let disposed = false
  async function refresh() {
    loadFailed.value = false
    const results = await Promise.allSettled([
      defineInvoke(context, desktopCompanionGet)(),
      defineInvoke(context, desktopCapabilitiesGet)(),
    ])
    if (disposed)
      return
    if (results[0].status === 'fulfilled')
      apply(results[0].value)
    else
      loadFailed.value = true
    if (results[1].status === 'fulfilled')
      applyCapabilities(results[1].value)
    else
      loadFailed.value = true
  }
  async function setPreferences(patch: Partial<DesktopPreferences>) {
    apply(await defineInvoke(context, desktopCompanionSetPreferences)(patch))
  }
  async function publish(input: DesktopNotificationInput) {
    apply(await defineInvoke(context, desktopNotificationPublish)(input))
  }
  async function markRead(id?: string) {
    apply(await defineInvoke(context, desktopNotificationRead)({ id }))
  }
  async function clear() {
    apply(await defineInvoke(context, desktopNotificationClear)())
  }
  void refresh()
  onScopeDispose(() => {
    disposed = true
    cleanups.forEach(dispose => dispose())
  })
  return { snapshot, capabilities, cursor, preferences, ready, loadFailed, refresh, setPreferences, publish, markRead, clear }
})
