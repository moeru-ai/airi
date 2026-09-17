<script setup lang="ts">
import type { AiriMicrophonePermissionState } from '../../../../shared/eventa'

import { Button } from '@proj-airi/ui'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { initializeHostContext, useHostMicrophonePermission } from '../../../host-context'

const { t } = useI18n()
const isKirie = initializeHostContext().runtime === 'kirie'
const permission = isKirie ? useHostMicrophonePermission() : undefined
const busy = ref(false)
const status = computed<AiriMicrophonePermissionState>(() => permission?.status.value ?? 'not-determined')
const statusLabel = computed(() => t(`tamagotchi.settings.microphone-permission.states.${status.value}`))
const actionLabel = computed(() => status.value === 'granted'
  ? t('tamagotchi.settings.microphone-permission.settings.revoke')
  : t('tamagotchi.settings.microphone-permission.settings.reset'))
const statusClasses = computed(() => {
  if (status.value === 'granted')
    return 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
  if (status.value === 'denied')
    return 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
  return 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
})

async function resetPermission() {
  if (!permission || status.value === 'not-determined' || busy.value)
    return

  busy.value = true
  try {
    await permission.reset()
  }
  catch (error) {
    console.error('[permissions] Failed to reset microphone permission:', error)
  }
  finally {
    busy.value = false
  }
}

onMounted(() => {
  void permission?.refresh().catch((error) => {
    console.warn('[permissions] Failed to load microphone permission state:', error)
  })
})
</script>

<template>
  <div :class="['flex flex-col gap-4 pb-8']">
    <section
      :class="[
        'rounded-xl border border-neutral-200 bg-white/70 p-5 dark:border-neutral-700 dark:bg-neutral-900/60',
        'flex flex-col gap-5',
      ]"
    >
      <div :class="['flex items-start gap-4']">
        <div
          :class="[
            'h-11 w-11 shrink-0 rounded-xl',
            'flex items-center justify-center',
            'bg-primary-100 text-primary-600 dark:bg-primary-900/60 dark:text-primary-300',
          ]"
        >
          <div :class="['i-solar:microphone-3-bold-duotone text-6']" />
        </div>
        <div :class="['min-w-0 flex-1']">
          <div :class="['flex flex-wrap items-center gap-2']">
            <h2 :class="['text-base text-neutral-900 font-semibold dark:text-neutral-100']">
              {{ t('tamagotchi.settings.microphone-permission.settings.title') }}
            </h2>
            <span
              :class="[
                'rounded-full px-2.5 py-1 text-xs font-medium',
                statusClasses,
              ]"
            >
              {{ statusLabel }}
            </span>
          </div>
          <p :class="['mt-2 text-sm text-neutral-600 leading-6 dark:text-neutral-300']">
            {{ t('tamagotchi.settings.microphone-permission.settings.description') }}
          </p>
        </div>
      </div>

      <div :class="['flex justify-end']">
        <Button
          :disabled="!isKirie || status === 'not-determined' || busy"
          :loading="busy"
          :label="actionLabel"
          :color="status === 'granted' ? 'red' : 'neutral'"
          :variant="status === 'granted' ? 'primary' : 'secondary'"
          @click="resetPermission"
        />
      </div>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.system.permissions.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
