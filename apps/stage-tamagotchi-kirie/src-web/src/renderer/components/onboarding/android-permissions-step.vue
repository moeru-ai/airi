<script setup lang="ts">
import type { AiriAndroidPermission } from '../../../shared/eventa'

import { Button, ScrollableArea } from '@proj-airi/ui'
import { useLocalStorage } from '@vueuse/core'
import { onMounted, onUnmounted, reactive } from 'vue'
import { useI18n } from 'vue-i18n'

import AndroidPermissionCard from './android-permission-card.vue'

import { useHostAndroidPermissions } from '../../host-context'

const props = defineProps<{
  onNext: () => Promise<void> | void
  onPrevious: () => Promise<void> | void
}>()

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
const requested = {
  microphone: useLocalStorage('permissions/microphone/requested', false),
  notifications: useLocalStorage('permissions/notifications/requested', false),
}

async function refreshPermission(permission: AiriAndroidPermission) {
  granted[permission] = await permissions.check(permission)
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
    await refreshPermission(permission)
    if (granted[permission])
      return

    if (requested[permission].value) {
      await permissions.openSettings(permission)
      return
    }

    requested[permission].value = true
    granted[permission] = await permissions.request(permission)
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
  <div h-full flex flex-col gap-4>
    <div sticky top-0 z-100 flex flex-shrink-0 items-center gap-2>
      <button outline-none @click="props.onPrevious">
        <div i-solar:alt-arrow-left-line-duotone h-5 w-5 />
      </button>
      <h2 class="flex-1 text-center text-xl text-neutral-800 font-semibold md:text-left md:text-2xl dark:text-neutral-100">
        {{ t('settings.dialogs.onboarding.permissions.title') }}
      </h2>
      <div h-5 w-5 />
    </div>

    <ScrollableArea class="min-h-0 flex-1">
      <div class="space-y-4">
        <p class="text-sm text-neutral-600 md:text-base dark:text-neutral-300">
          {{ t('settings.dialogs.onboarding.permissions.description') }}
        </p>

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

        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ t('settings.dialogs.onboarding.permissions.optionalHint') }}
        </p>
      </div>
    </ScrollableArea>

    <Button
      :label="t('settings.dialogs.onboarding.next')"
      @click="props.onNext"
    />
  </div>
</template>
