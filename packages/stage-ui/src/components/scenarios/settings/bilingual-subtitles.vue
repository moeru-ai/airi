<script setup lang="ts">
import { Callout, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import CheckBar from './check-bar.vue'

import { BILINGUAL_LANGUAGES, BILINGUAL_NONE } from '../../../libs/bilingual/languages'
import { buildBilingualPrompt } from '../../../libs/bilingual/prompt'
import { useSettingsBilingual } from '../../../stores/settings/bilingual'

const { t } = useI18n()
const bilingualStore = useSettingsBilingual()
const { enabled, ttsLanguage, translationLanguage, subtitleLanguages } = storeToRefs(bilingualStore)

// Typed as plain string values so the selected code round-trips through the
// store without narrowing to the catalogue union.
const languageOptions = computed<{ label: string, value: string }[]>(() =>
  BILINGUAL_LANGUAGES.map(language => ({
    label: language.display,
    value: language.code,
  })),
)

const translationOptions = computed<{ label: string, value: string }[]>(() => [
  ...languageOptions.value,
  { label: t('settings.pages.bilingual.none'), value: BILINGUAL_NONE },
])

const promptPreview = computed(() => buildBilingualPrompt({
  ttsLanguage: ttsLanguage.value,
  subtitleLanguages: subtitleLanguages.value,
}))
</script>

<template>
  <div flex="~ col gap-4">
    <CheckBar
      v-model="enabled"
      :text="t('settings.pages.bilingual.enable.title')"
      :description="t('settings.pages.bilingual.enable.description')"
      icon-on="i-solar:check-circle-bold-duotone text-primary-500 dark:text-primary-400"
      icon-off="i-solar:close-circle-bold-duotone text-neutral-400 dark:text-neutral-600"
    />

    <div v-if="enabled" flex="~ col gap-4" rounded-xl bg="neutral-50 dark:neutral-800" p-4>
      <FieldSelect
        v-model="ttsLanguage"
        :label="t('settings.pages.bilingual.tts-language.title')"
        :description="t('settings.pages.bilingual.tts-language.description')"
        :options="languageOptions"
        layout="horizontal"
        variant="blurry"
      />
      <FieldSelect
        v-model="translationLanguage"
        :label="t('settings.pages.bilingual.translation-language.title')"
        :description="t('settings.pages.bilingual.translation-language.description')"
        :options="translationOptions"
        layout="horizontal"
        variant="blurry"
      />

      <Callout
        v-if="promptPreview"
        :label="t('settings.pages.bilingual.preview.title')"
        theme="violet"
      >
        <p mb-2 text-xs>
          {{ t('settings.pages.bilingual.preview.description') }}
        </p>
        <pre whitespace-pre-wrap text-xs leading-relaxed>{{ promptPreview }}</pre>
      </Callout>
    </div>
  </div>
</template>
