<script setup lang="ts">
import { LocalNotifications } from '@capacitor/local-notifications'
import { Button } from '@proj-airi/ui'
import { inject, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { OnboardingContextKey } from '@proj-airi/stage-ui/components/scenarios/dialogs/onboarding/utils'

const { t } = useI18n()
const context = inject(OnboardingContextKey)!

const permissionStatus = ref<'unknown' | 'granted' | 'denied' | 'prompt'>('unknown')
const isRequesting = ref(false)

async function checkPermission() {
  try {
    const permission = await LocalNotifications.checkPermissions()
    if (permission.display === 'granted') {
      permissionStatus.value = 'granted'
    }
    else if (permission.display === 'denied') {
      permissionStatus.value = 'denied'
    }
    else {
      permissionStatus.value = 'prompt'
    }
  }
  catch (error) {
    console.error('Failed to check notification permission:', error)
    permissionStatus.value = 'prompt'
  }
}

async function requestPermission() {
  isRequesting.value = true
  try {
    const result = await LocalNotifications.requestPermissions()
    if (result.display === 'granted') {
      permissionStatus.value = 'granted'
    }
    else {
      permissionStatus.value = 'denied'
    }
  }
  catch (error) {
    console.error('Failed to request notification permission:', error)
    permissionStatus.value = 'denied'
  }
  finally {
    isRequesting.value = false
  }
}

onMounted(() => {
  checkPermission()
})
</script>

<template>
  <div h-full flex flex-col gap-4>
    <div sticky top-0 z-100 flex flex-shrink-0 items-center gap-2>
      <button outline-none @click="context.handlePreviousStep">
        <div i-solar:alt-arrow-left-line-duotone h-5 w-5 />
      </button>
      <h2 class="flex-1 text-center text-xl text-neutral-800 font-semibold md:text-left md:text-2xl dark:text-neutral-100">
        {{ t('settings.dialogs.onboarding.notification-permission.title') }}
      </h2>
      <div h-5 w-5 />
    </div>

    <div flex flex-1 flex-col justify-center gap-4>
      <div class="text-center text-neutral-600 dark:text-neutral-400">
        <p class="mb-4 text-base md:text-lg">
          {{ t('settings.dialogs.onboarding.notification-permission.description') }}
        </p>
      </div>

      <div v-if="permissionStatus === 'granted'" class="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
        <div i-solar:check-circle-bold-duotone h-6 w-6 />
        <span>{{ t('settings.dialogs.onboarding.notification-permission.granted') }}</span>
      </div>

      <div v-else-if="permissionStatus === 'denied'" class="flex items-center justify-center gap-2 text-orange-600 dark:text-orange-400">
        <div i-solar:info-circle-bold-duotone h-6 w-6 />
        <span class="text-sm">{{ t('settings.dialogs.onboarding.notification-permission.denied') }}</span>
      </div>

      <div v-if="permissionStatus === 'prompt' || permissionStatus === 'denied'" class="flex justify-center">
        <Button
          :loading="isRequesting"
          :label="t('settings.dialogs.onboarding.notification-permission.request-button')"
          @click="requestPermission"
        />
      </div>
    </div>

    <div flex flex-col gap-2>
      <Button
        variant="primary"
        :label="t('settings.dialogs.onboarding.saveAndContinue')"
        @click="context.handleSave"
      />
      <Button
        variant="ghost"
        :label="t('settings.dialogs.onboarding.skipForNow')"
        @click="context.handleSave"
      />
    </div>
  </div>
</template>
