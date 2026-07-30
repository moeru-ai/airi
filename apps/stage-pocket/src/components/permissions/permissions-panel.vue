<script setup lang="ts">
import type { PluginListenerHandle } from '@capacitor/core'

import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { useLocalStorage } from '@vueuse/core'
import { AndroidSettings, IOSSettings, NativeSettings } from 'capacitor-native-settings'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import PermissionCard from './permission-card.vue'

import { MicrophonePermission } from '../../modules/microphone-permission'

const { t } = useI18n()
const audioDeviceStore = useSettingsAudioDevice()
const { permissionGranted: microphonePermissionGrantedFromStore } = storeToRefs(audioDeviceStore)

const isNativePlatform = Capacitor.isNativePlatform()
const isAndroid = Capacitor.getPlatform() === 'android'

const notificationPermissionGranted = shallowRef(false)
const microphonePermissionGranted = shallowRef(false)
const requestingNotificationPermission = shallowRef(false)
const requestingMicrophonePermission = shallowRef(false)
const microphonePermissionRequested = useLocalStorage('permissions/microphone/requested', false)

let appStateListener: Promise<PluginListenerHandle> | undefined

async function refreshNotificationPermission() {
  const permission = await LocalNotifications.checkPermissions()
  notificationPermissionGranted.value = permission.display === 'granted'
}

async function refreshMicrophonePermission() {
  if (isAndroid) {
    const permission = await MicrophonePermission.checkPermission()
    microphonePermissionGranted.value = permission.granted
    return
  }

  const permission = await navigator.permissions?.query({ name: 'microphone' }).catch(() => undefined)
  microphonePermissionGranted.value = permission
    ? permission.state === 'granted'
    : microphonePermissionGrantedFromStore.value
}

async function refreshPermissionStates() {
  await Promise.all([
    refreshNotificationPermission().catch(error => console.error('Unable to refresh notification permission:', error)),
    refreshMicrophonePermission().catch(error => console.error('Unable to refresh microphone permission:', error)),
  ])
}

async function requestNotificationPermission() {
  requestingNotificationPermission.value = true
  try {
    const beforeRequest = await LocalNotifications.checkPermissions()
    if (beforeRequest.display === 'granted') {
      notificationPermissionGranted.value = true
      return
    }

    if (beforeRequest.display === 'denied') {
      notificationPermissionGranted.value = false
      if (isNativePlatform) {
        await NativeSettings.open({
          optionAndroid: AndroidSettings.AppNotification,
          optionIOS: IOSSettings.AppNotification,
        })
      }
      return
    }

    const requested = await LocalNotifications.requestPermissions()
    notificationPermissionGranted.value = requested.display === 'granted'
  }
  finally {
    requestingNotificationPermission.value = false
  }
}

async function requestMicrophonePermission() {
  requestingMicrophonePermission.value = true
  try {
    await refreshMicrophonePermission()
    if (microphonePermissionGranted.value)
      return

    if (microphonePermissionRequested.value && isNativePlatform) {
      await NativeSettings.open({
        optionAndroid: AndroidSettings.ApplicationDetails,
        optionIOS: IOSSettings.App,
      })
      return
    }

    // Persist before requesting so later native clicks take the settings route, including after denial.
    microphonePermissionRequested.value = true
    await audioDeviceStore.askPermission()
    await refreshMicrophonePermission()
  }
  finally {
    requestingMicrophonePermission.value = false
  }
}

onMounted(() => {
  void refreshPermissionStates()

  if (isNativePlatform) {
    appStateListener = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive)
        void refreshPermissionStates()
    })
  }
})

onUnmounted(() => {
  void appStateListener?.then(listener => listener.remove())
})
</script>

<template>
  <div :class="['flex flex-col gap-4']">
    <PermissionCard
      :title="t('settings.dialogs.onboarding.permissions.notificationsTitle')"
      :description="t('settings.dialogs.onboarding.permissions.notificationsDescription')"
      :action-label="t('settings.dialogs.onboarding.permissions.requestAction')"
      :granted="notificationPermissionGranted"
      :disabled="requestingNotificationPermission"
      @request="requestNotificationPermission"
    />

    <PermissionCard
      :title="t('settings.dialogs.onboarding.permissions.microphoneTitle')"
      :description="t('settings.dialogs.onboarding.permissions.microphoneDescription')"
      :action-label="t('settings.dialogs.onboarding.permissions.requestAction')"
      :granted="microphonePermissionGranted"
      :disabled="requestingMicrophonePermission"
      @request="requestMicrophonePermission"
    />
  </div>
</template>
