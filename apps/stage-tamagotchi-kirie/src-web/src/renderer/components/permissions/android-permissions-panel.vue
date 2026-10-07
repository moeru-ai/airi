<script setup lang="ts">
import type { AiriAndroidPermission, AiriAndroidPermissionSnapshot, AiriAndroidPermissionState } from '../../../shared/eventa'

import { useLocalStorage } from '@vueuse/core'
import { onMounted, onUnmounted, reactive } from 'vue'
import { useI18n } from 'vue-i18n'

import AndroidPermissionCard from './android-permission-card.vue'

import { useHostAndroidPermissions } from '../../host-context'

const { t } = useI18n()
const permissions = useHostAndroidPermissions()
const granted = reactive<Record<AiriAndroidPermission, boolean>>({
  microphone: false,
  notifications: false,
})
const requesting = reactive<Record<AiriAndroidPermission, boolean>>({
  microphone: false,
  notifications: false,
})
const state = reactive<Record<AiriAndroidPermission, AiriAndroidPermissionState>>({
  microphone: 'prompt',
  notifications: 'prompt',
})
const microphonePermissionRequested = useLocalStorage('permissions/microphone/requested', false)

function applySnapshot(permission: AiriAndroidPermission, snapshot: AiriAndroidPermissionSnapshot) {
  granted[permission] = snapshot.granted
  state[permission] = snapshot.state
}

async function refreshPermission(permission: AiriAndroidPermission) {
  applySnapshot(permission, await permissions.check(permission))
}

async function refreshPermissions() {
  await Promise.all([
    refreshPermission('notifications'),
    refreshPermission('microphone'),
  ])
}

async function requestPermission(permission: AiriAndroidPermission) {
  if (requesting[permission] || granted[permission])
    return

  requesting[permission] = true
  try {
    const snapshot = await permissions.check(permission)
    applySnapshot(permission, snapshot)
    if (granted[permission])
      return

    if (permission === 'notifications' && state.notifications === 'denied') {
      await permissions.openSettings(permission)
      return
    }

    if (permission === 'microphone' && microphonePermissionRequested.value) {
      await permissions.openSettings(permission)
      return
    }

    if (permission === 'microphone')
      microphonePermissionRequested.value = true

    applySnapshot(permission, await permissions.request(permission))
  }
  finally {
    requesting[permission] = false
  }
}

function refreshWhenVisible() {
  if (document.visibilityState === 'visible')
    void refreshPermissions()
}

onMounted(() => {
  void refreshPermissions()
  window.addEventListener('focus', refreshWhenVisible)
  document.addEventListener('visibilitychange', refreshWhenVisible)
})

onUnmounted(() => {
  window.removeEventListener('focus', refreshWhenVisible)
  document.removeEventListener('visibilitychange', refreshWhenVisible)
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <AndroidPermissionCard
      :title="t('settings.dialogs.onboarding.permissions.notificationsTitle')"
      :description="t('settings.dialogs.onboarding.permissions.notificationsDescription')"
      :action-label="t('settings.dialogs.onboarding.permissions.requestAction')"
      :granted="granted.notifications"
      :disabled="requesting.notifications"
      @request="requestPermission('notifications')"
    />

    <AndroidPermissionCard
      :title="t('settings.dialogs.onboarding.permissions.microphoneTitle')"
      :description="t('settings.dialogs.onboarding.permissions.microphoneDescription')"
      :action-label="t('settings.dialogs.onboarding.permissions.requestAction')"
      :granted="granted.microphone"
      :disabled="requesting.microphone"
      @request="requestPermission('microphone')"
    />
  </div>
</template>
