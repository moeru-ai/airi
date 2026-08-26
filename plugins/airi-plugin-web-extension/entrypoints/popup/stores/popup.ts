import type { ExtensionSettings, ExtensionStatus } from '../../../src/shared/types'

import { createGlobalState } from '@vueuse/core'
import { computed, reactive, ref, watch } from 'vue'

import { clearError, onBackgroundStatus, requestStatus, requestVisionFrame, toggleEnabled, updateSettings } from '../../../src/popup/bridge'

const STORAGE_KEY = 'airi-popup-settings'

export const usePopupStore = createGlobalState(() => {
  const status = ref<ExtensionStatus | null>(null)
  const syncing = ref(true)
  const initialized = ref(false)

  const form = reactive<ExtensionSettings>({
    wsUrl: '',
    token: '',
    enabled: true,
    sendPageContext: true,
    sendVideoContext: true,
    sendSubtitles: true,
    sendSparkNotify: true,
    enableVision: false,
  })

  const connected = computed(() => status.value?.connected ?? false)
  const lastVideo = computed(() => status.value?.lastVideo)
  const lastSubtitle = computed(() => status.value?.lastSubtitle)
  const lastError = computed(() => status.value?.lastError)

  function hydrate(next: ExtensionStatus) {
    status.value = next
    Object.assign(form, next.settings)
  }

  function loadStoredSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw)
        return
      const parsed = JSON.parse(raw) as Partial<ExtensionSettings>
      Object.assign(form, parsed)
    }
    catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  function persistSettings() {
    const payload: ExtensionSettings = { ...form }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }

  async function refresh() {
    syncing.value = true
    try {
      const next = await requestStatus()
      hydrate(next)
    }
    finally {
      syncing.value = false
    }
  }

  async function applySettings() {
    syncing.value = true
    try {
      const next = await updateSettings({ ...form })
      hydrate(next)
    }
    finally {
      syncing.value = false
    }
  }

  async function toggle() {
    syncing.value = true
    try {
      const next = await toggleEnabled(!form.enabled)
      hydrate(next)
    }
    finally {
      syncing.value = false
    }
  }

  async function captureFrame() {
    syncing.value = true
    try {
      const next = await requestVisionFrame()
      hydrate(next)
    }
    finally {
      syncing.value = false
    }
  }

  async function clearLastError() {
    const next = await clearError()
    hydrate(next)
  }

  function init() {
    if (initialized.value)
      return
    initialized.value = true
    loadStoredSettings()
    watch(form, persistSettings, { deep: true })
    void refresh()
    onBackgroundStatus(hydrate)
  }

  return {
    status,
    syncing,
    form,
    connected,
    lastVideo,
    lastSubtitle,
    lastError,
    init,
    refresh,
    applySettings,
    toggle,
    captureFrame,
    clearLastError,
  }
})
