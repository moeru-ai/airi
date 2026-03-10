<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { Button } from '@proj-airi/ui'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

type PermissionState = 'unknown' | 'requesting' | 'granted' | 'not-granted'

interface Props {
  onNext: () => Promise<void> | void
  onPrevious: () => void
}

const props = defineProps<Props>()
const { t } = useI18n()

const isNativePlatform = Capacitor.isNativePlatform()

const notificationPermission = ref<PermissionState>('unknown')

const shouldShowOpenSettings = computed(() => {
  if (!isNativePlatform)
    return false
  return notificationPermission.value === 'not-granted'
})

const notificationStateLabel = computed(() => getPermissionLabel(notificationPermission.value))

function getPermissionLabel(state: PermissionState): string {
  if (state === 'granted')
    return t('settings.dialogs.onboarding.permissions.stateGranted')
  if (state === 'not-granted')
    return t('settings.dialogs.onboarding.permissions.stateNotGranted')
  if (state === 'requesting')
    return t('settings.dialogs.onboarding.permissions.stateRequesting')
  return t('settings.dialogs.onboarding.permissions.stateUnknown')
}

function mapNotificationPermission(display: string): PermissionState {
  if (display === 'granted')
    return 'granted'
  if (display === 'denied')
    return 'not-granted'
  return 'unknown'
}

async function syncNotificationPermission() {
  try {
    const permission = await LocalNotifications.checkPermissions()
    notificationPermission.value = mapNotificationPermission(permission.display)
  }
  catch {
    notificationPermission.value = 'unknown'
  }
}

async function requestNotificationPermission() {
  notificationPermission.value = 'requesting'

  try {
    const beforeRequest = await LocalNotifications.checkPermissions()
    if (beforeRequest.display === 'granted') {
      notificationPermission.value = 'granted'
      return
    }

    const requested = await LocalNotifications.requestPermissions()
    notificationPermission.value = mapNotificationPermission(requested.display)
  }
  catch {
    notificationPermission.value = 'not-granted'
  }
}

async function openSystemSettings() {
  interface CapacitorAppPlugin {
    openSettings?: () => Promise<void>
  }

  const appPlugin = (window as { Capacitor?: { Plugins?: { App?: CapacitorAppPlugin } } }).Capacitor?.Plugins?.App
  await appPlugin?.openSettings?.()
}

onMounted(async () => {
  await syncNotificationPermission()
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
          <span class="rounded-full bg-neutral-200 px-2 py-1 text-xs text-neutral-700 font-medium dark:bg-neutral-700 dark:text-neutral-100">
            {{ notificationStateLabel }}
          </span>
        </div>
        <Button
          :label="t('settings.dialogs.onboarding.permissions.notificationsAction')"
          :loading="notificationPermission === 'requesting'"
          :disabled="notificationPermission === 'requesting'"
          @click="requestNotificationPermission"
        />
        <p v-if="notificationPermission === 'not-granted'" class="mt-2 text-xs text-amber-600 dark:text-amber-400">
          {{ t('settings.dialogs.onboarding.permissions.notificationsNotGrantedHint') }}
        </p>
      </section>

      <Button
        v-if="shouldShowOpenSettings"
        variant="secondary"
        :label="t('settings.dialogs.onboarding.permissions.openSettings')"
        @click="openSystemSettings"
      />

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
