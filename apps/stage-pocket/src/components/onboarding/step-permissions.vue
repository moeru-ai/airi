<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { Button } from '@proj-airi/ui'
import { AndroidSettings, IOSSettings, NativeSettings } from 'capacitor-native-settings'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

type PermissionState = boolean | undefined

interface Props {
  onNext: () => Promise<void> | void
  onPrevious: () => void
}

const props = defineProps<Props>()
const { t } = useI18n()

const isNativePlatform = Capacitor.isNativePlatform()

const notificationPermissionGranted = ref<PermissionState>(undefined)

async function requestNotificationPermission() {
  const beforeRequest = await LocalNotifications.checkPermissions()
  if (beforeRequest.display === 'granted') {
    notificationPermissionGranted.value = true
    return
  }

  const requested = await LocalNotifications.requestPermissions()
  if (requested.display === 'granted') {
    notificationPermissionGranted.value = true
    return
  }

  if (isNativePlatform) {
    NativeSettings.open({
      optionAndroid: AndroidSettings.AppNotification,
      optionIOS: IOSSettings.AppNotification,
    })
  }
}
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

    <div flex-1 overflow-y-auto space-y-4>
      <p class="text-sm text-neutral-600 md:text-base dark:text-neutral-300">
        {{ t('settings.dialogs.onboarding.permissions.description') }}
      </p>

      <section class="border border-neutral-200 rounded-xl bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/50">
        <div class="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 class="text-sm text-neutral-800 font-semibold dark:text-neutral-100">
              {{ t('settings.dialogs.onboarding.permissions.notificationsTitle') }}
            </h3>
            <p class="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
              {{ t('settings.dialogs.onboarding.permissions.notificationsDescription') }}
            </p>
          </div>
          <span v-if="notificationPermissionGranted" class="i-solar:check-circle-linear h-5 w-5 text-green-700 dark:text-green-400" />
        </div>
        <Button
          :label="t('settings.dialogs.onboarding.permissions.notificationsAction')"
          @click="requestNotificationPermission"
        />
      </section>

      <p class="text-xs text-neutral-500 dark:text-neutral-400">
        {{ t('settings.dialogs.onboarding.permissions.optionalHint') }}
      </p>
    </div>

    <Button
      :label="t('settings.dialogs.onboarding.next')"
      @click="props.onNext"
    />
  </div>
</template>
