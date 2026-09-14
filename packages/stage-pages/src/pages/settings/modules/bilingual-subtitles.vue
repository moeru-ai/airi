<script setup lang="ts">
import { Alert } from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { bilingualLanguageOptions, useSettingsBilingualSubtitles } from '@proj-airi/stage-ui/stores/settings/bilingual-subtitles'
import { FieldCheckbox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const bilingualStore = useSettingsBilingualSubtitles()
const { enabled, spokenLanguage, translationLanguage } = storeToRefs(bilingualStore)
const speechStore = useSpeechStore()
const { activeSpeechVoice } = storeToRefs(speechStore)

const selectClass = [
  'w-full px-3 py-2',
  'border border-neutral-300 rounded dark:border-neutral-700',
  'bg-white dark:bg-neutral-900',
]

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
</script>

<template>
  <div flex="~ col gap-6">
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

      <fieldset v-if="enabled" flex="~ col gap-4" class="max-w-md">
        <label flex="~ col gap-1">
          <span class="text-sm font-medium">
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

        <label flex="~ col gap-1">
          <span class="text-sm font-medium">
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
    text="neutral-200/50 dark:neutral-600/20" pointer-events-none
    fixed top="[calc(100dvh-15rem)]" bottom-0 right--5 z--1
    :initial="{ scale: 0.9, opacity: 0, x: 20 }"
    :enter="{ scale: 1, opacity: 1, x: 0 }"
    :duration="500"
    size-60
    flex items-center justify-center
  >
    <div text="60" i-solar:translation-2-bold-duotone />
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
