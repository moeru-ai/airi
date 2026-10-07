<script setup lang="ts">
import { Alert } from '@proj-airi/stage-ui/components'
import { OFFICIAL_SPEECH_STREAMING_PROVIDER_ID } from '@proj-airi/stage-ui/libs/providers/providers/official'
import { isBufferedStreamingResourceId, resolveStreamingSessionModel } from '@proj-airi/stage-ui/libs/speech/streaming-buffer'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { bilingualLanguageOptions, useSettingsBilingualSubtitles } from '@proj-airi/stage-ui/stores/settings/bilingual-subtitles'
import { FieldCheckbox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const bilingualStore = useSettingsBilingualSubtitles()
const { enabled, spokenLanguage, translationLanguage } = storeToRefs(bilingualStore)
const speechStore = useSpeechStore()
const { activeSpeechVoice, activeSpeechModel } = storeToRefs(speechStore)
const providersStore = useProviderStore()

const selectClass = [
  'w-full px-3 py-2',
  'border border-neutral-300 rounded dark:border-neutral-700',
  'bg-white dark:bg-neutral-900',
]

const fieldClass = ['flex flex-col gap-1']
const fieldTitleClass = ['text-sm font-medium']

// The voice catalog stores language codes such as `en-US`. Match the base
// ISO 639-1 part so a regional voice still counts as compatible.
const voiceMayNotSupportSpokenLanguage = computed(() => {
  if (!enabled.value)
    return false
  const voice = activeSpeechVoice.value
  if (!voice)
    return false
  const spoken = spokenLanguage.value.toLowerCase()
  return !voice.languages.some((language) => {
    const code = language.code.toLowerCase()
    return code === spoken || code.startsWith(`${spoken}-`)
  })
})

// Buffered streaming models (Seed-TTS 2.0 / ICL 2.0) expose sentence timing
// during synthesis with no playback offsets, so translation captions cannot
// follow the voice. Resolve the model exactly like the speech session does.
const bufferedSpeechCaptionsUnsupported = computed(() => {
  if (!enabled.value)
    return false
  const model = resolveStreamingSessionModel(
    activeSpeechModel.value as string | undefined,
    providersStore.getDefaultModelForProvider(OFFICIAL_SPEECH_STREAMING_PROVIDER_ID),
  )
  if (!model)
    return false
  return isBufferedStreamingResourceId(model.split('/', 2)[1] ?? '')
})
</script>

<template>
  <div :class="['flex flex-col gap-6']">
    <div
      :class="[
        'h-fit w-full rounded-xl p-4',
        'flex flex-col gap-4',
        'bg-neutral-100 dark:bg-[rgba(0,0,0,0.3)]',
      ]"
    >
      <div>
        <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
          {{ t('settings.pages.modules.bilingual_subtitles.title') }}
        </h2>
        <div text="neutral-400 dark:neutral-500">
          {{ t('settings.pages.modules.bilingual_subtitles.description') }}
        </div>
      </div>

      <FieldCheckbox
        v-model="enabled"
        :label="t('settings.pages.modules.bilingual_subtitles.enable.label')"
        :description="t('settings.pages.modules.bilingual_subtitles.enable.description')"
      />

      <fieldset v-if="enabled" :class="['flex flex-col gap-4', 'max-w-md']">
        <label :class="fieldClass">
          <span :class="fieldTitleClass">
            {{ t('settings.pages.modules.bilingual_subtitles.spoken_language.label') }}
          </span>
          <span class="text-sm text-neutral-400 dark:text-neutral-500">
            {{ t('settings.pages.modules.bilingual_subtitles.spoken_language.description') }}
          </span>
          <select v-model="spokenLanguage" :class="selectClass">
            <option
              v-for="language in bilingualLanguageOptions"
              :key="language.code"
              :value="language.code"
              :disabled="language.code === translationLanguage"
            >
              {{ language.label }}{{ language.code === translationLanguage ? ` (${t('settings.pages.modules.bilingual_subtitles.translation_subtitle_1.same_language_disabled')})` : '' }}
            </option>
          </select>
        </label>

        <label :class="fieldClass">
          <span :class="fieldTitleClass">
            {{ t('settings.pages.modules.bilingual_subtitles.translation_subtitle_1.label') }}
          </span>
          <select v-model="translationLanguage" :class="selectClass">
            <option
              v-for="language in bilingualLanguageOptions"
              :key="language.code"
              :value="language.code"
              :disabled="language.code === spokenLanguage"
            >
              {{ language.label }}{{ language.code === spokenLanguage ? ` (${t('settings.pages.modules.bilingual_subtitles.translation_subtitle_1.same_language_disabled')})` : '' }}
            </option>
          </select>
        </label>

        <Alert
          v-if="bufferedSpeechCaptionsUnsupported"
          type="warning"
          icon="i-solar:info-circle-line-duotone"
        >
          <template #title>
            {{ t('settings.pages.modules.bilingual_subtitles.buffered_speech_warning') }}
          </template>
        </Alert>

        <Alert
          v-if="voiceMayNotSupportSpokenLanguage"
          type="warning"
          icon="i-solar:info-circle-line-duotone"
        >
          <template #title>
            {{ t('settings.pages.modules.bilingual_subtitles.voice_warning') }}
          </template>
        </Alert>
      </fieldset>
    </div>
  </div>

  <div
    v-motion
    :class="[
      'pointer-events-none fixed z--1 right--5 bottom-0 top-[calc(100dvh-15rem)] size-60',
      'flex items-center justify-center',
      'text-neutral-200/50 dark:text-neutral-600/20',
    ]"
    :initial="{ scale: 0.9, opacity: 0, x: 20 }"
    :enter="{ scale: 1, opacity: 1, x: 0 }"
    :duration="500"
  >
    <div :class="['text-60', 'i-solar:translation-2-bold-duotone']" />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.bilingual_subtitles.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
