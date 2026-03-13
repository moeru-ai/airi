<script setup lang="ts">
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const hearingStore = useHearingStore()
const { speechProviderSettings } = storeToRefs(hearingStore)
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-col gap-2">
      <div class="text-sm font-bold opacity-50">
        {{ t('settings.providers.speech.app_local_audio.title') }}
      </div>
      <div class="text-xs opacity-50">
        {{ t('settings.providers.speech.app_local_audio.description') }}
      </div>
    </div>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div class="flex flex-col gap-1.5">
        <label class="text-xs font-bold opacity-50">
          {{ t('settings.providers.speech.app_local_audio.device_id') }}
        </label>
        <input
          v-model="speechProviderSettings['app-local-audio-speech'].deviceId"
          type="text"
          class="w-full border border-neutral-200 rounded-lg bg-neutral-100 px-3 py-2 text-sm outline-none dark:border-neutral-800 dark:bg-neutral-800"
          :placeholder="t('settings.providers.speech.app_local_audio.device_id_placeholder')"
        >
      </div>

      <div class="flex flex-col gap-1.5">
        <label class="text-xs font-bold opacity-50">
          {{ t('settings.providers.speech.app_local_audio.sample_rate') }}
        </label>
        <input
          v-model="speechProviderSettings['app-local-audio-speech'].sampleRate"
          type="number"
          class="w-full border border-neutral-200 rounded-lg bg-neutral-100 px-3 py-2 text-sm outline-none dark:border-neutral-800 dark:bg-neutral-800"
          :placeholder="t('settings.providers.speech.app_local_audio.sample_rate_placeholder')"
        >
      </div>
    </div>
  </div>
</template>
