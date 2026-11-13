<script setup lang="ts">
import { all } from '@proj-airi/i18n'
import { Select } from '@proj-airi/ui'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * Each locale holds its own translation of this text, so the text of a locale is in that language.
 * The user picks the language that they want the voiceprint for, and reads its text.
 */
const SAMPLE_KEY = 'settings.pages.modules.hearing.voiceprint.sample'

const { t, te, locale } = useI18n()

/** The languages that have the text. A locale without a translation has no option, because vue-i18n shows English for it. */
const languages = computed(() => Object.entries(all).filter(([code]) => te(SAMPLE_KEY, code)).map(([value, label]) => ({ value, label })))
/** The language that the user picked on this page. Until then, the text follows the interface language, or English without a translation. */
const picked = shallowRef<string>()
const language = computed({
  get: () => picked.value ?? (te(SAMPLE_KEY, locale.value) ? locale.value : 'en'),
  set: (value) => { picked.value = value },
})
const text = computed(() => t(SAMPLE_KEY, {}, { locale: language.value }))
</script>

<template>
  <div :class="['flex flex-col gap-2']">
    <!-- The text is a suggestion: speech in any words enrolls. The small picker is as wide as the name of the language. -->
    <label :class="['flex items-center justify-between gap-2 text-xs', 'text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.pages.modules.hearing.voiceprint.sample-prompt') }}
      <span v-if="languages.length > 1" :class="['shrink-0']">
        <Select v-model="language" :options="languages" shape="rounded" size="sm" />
      </span>
    </label>
    <p :lang="language" data-testid="voiceprint-sample" :class="['m-0 text-sm leading-relaxed', 'text-neutral-700 dark:text-neutral-200']">
      {{ text }}
    </p>
  </div>
</template>
