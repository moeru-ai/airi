<script setup lang="ts">
import type { PatternDisruptorSettings } from '@proj-airi/pattern-disruptor'

import { Checkbox, FieldInput, FieldRange, FieldValues, Select } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const settings = defineModel<PatternDisruptorSettings>('settings', { required: true })

const { t } = useI18n()

const languageOptions = computed(() => [
  { value: 'auto', label: t('settings.pages.modules.pattern-disruptor.language.options.auto') },
  { value: 'en', label: t('settings.pages.modules.pattern-disruptor.language.options.en') },
  { value: 'ru', label: t('settings.pages.modules.pattern-disruptor.language.options.ru') },
])

const modeOptions = computed(() => [
  { value: 'random', label: t('settings.pages.modules.pattern-disruptor.random.mode.options.random') },
  { value: 'double-pass', label: t('settings.pages.modules.pattern-disruptor.random.mode.options.double-pass') },
  { value: 'contextual', label: t('settings.pages.modules.pattern-disruptor.random.mode.options.contextual') },
])

const synonymOutputOptions = computed(() => [
  {
    value: 'with-suggestions',
    label: t('settings.pages.modules.pattern-disruptor.synonyms.output.options.with-suggestions'),
  },
  { value: 'avoid-only', label: t('settings.pages.modules.pattern-disruptor.synonyms.output.options.avoid-only') },
])
</script>

<template>
  <div class="tab-content ml-auto mr-auto w-95%">
    <p class="mb-3">
      {{ t('settings.pages.modules.pattern-disruptor.card.description') }}
    </p>

    <div class="ml-auto mr-auto w-90% flex flex-col gap-5">
      <section class="border border-neutral-200 rounded-lg p-4 dark:border-neutral-700">
        <div class="mb-3 flex items-center justify-between gap-3">
          <label class="flex items-center gap-2 text-sm text-neutral-600 font-medium dark:text-neutral-300">
            <div i-solar:magic-stick-3-bold-duotone />
            {{ t('settings.pages.modules.pattern-disruptor.enable.label') }}
          </label>
          <Checkbox v-model="settings.enabled" />
        </div>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="flex flex-col gap-2">
            <label class="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
              <div i-lucide:languages />
              {{ t('settings.pages.modules.pattern-disruptor.language.label') }}
            </label>
            <Select v-model="settings.language" :options="languageOptions" class="w-full" />
          </div>
          <FieldRange
            v-model="settings.maxPromptWords"
            :label="t('settings.pages.modules.pattern-disruptor.max_prompt_words.label')"
            :description="t('settings.pages.modules.pattern-disruptor.max_prompt_words.description')"
            :min="20"
            :max="300"
            :step="10"
          />
        </div>
      </section>

      <section v-if="settings.enabled" class="border border-neutral-200 rounded-lg p-4 dark:border-neutral-700">
        <div class="mb-3 flex items-center justify-between gap-3">
          <label class="flex items-center gap-2 text-sm text-neutral-600 font-medium dark:text-neutral-300">
            <div i-solar:dice-bold-duotone />
            {{ t('settings.pages.modules.pattern-disruptor.random.title') }}
          </label>
          <Checkbox v-model="settings.randomWords.enabled" />
        </div>

        <div v-if="settings.randomWords.enabled" class="flex flex-col gap-4">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FieldRange
              v-model="settings.randomWords.wordCount"
              :label="t('settings.pages.modules.pattern-disruptor.random.word_count.label')"
              :description="t('settings.pages.modules.pattern-disruptor.random.word_count.description')"
              :min="1"
              :max="8"
              :step="1"
            />
            <div class="flex flex-col gap-2">
              <label class="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
                <div i-lucide:shuffle />
                {{ t('settings.pages.modules.pattern-disruptor.random.mode.label') }}
              </label>
              <Select v-model="settings.randomWords.mode" :options="modeOptions" class="w-full" />
            </div>
            <FieldRange
              v-model="settings.randomWords.wordLength"
              :label="t('settings.pages.modules.pattern-disruptor.random.word_length.label')"
              :description="t('settings.pages.modules.pattern-disruptor.random.word_length.description')"
              :min="0"
              :max="24"
              :step="1"
            />
            <FieldRange
              v-model="settings.randomWords.wordHistorySize"
              :label="t('settings.pages.modules.pattern-disruptor.random.history.label')"
              :description="t('settings.pages.modules.pattern-disruptor.random.history.description')"
              :min="0"
              :max="200"
              :step="5"
            />
          </div>

          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label
              class="flex items-center justify-between gap-2 border border-neutral-200 rounded-lg px-3 py-2 text-sm dark:border-neutral-700"
            >
              {{ t('settings.pages.modules.pattern-disruptor.random.parts.noun') }}
              <Checkbox v-model="settings.randomWords.partsOfSpeech.noun" />
            </label>
            <label
              class="flex items-center justify-between gap-2 border border-neutral-200 rounded-lg px-3 py-2 text-sm dark:border-neutral-700"
            >
              {{ t('settings.pages.modules.pattern-disruptor.random.parts.verb') }}
              <Checkbox v-model="settings.randomWords.partsOfSpeech.verb" />
            </label>
            <label
              class="flex items-center justify-between gap-2 border border-neutral-200 rounded-lg px-3 py-2 text-sm dark:border-neutral-700"
            >
              {{ t('settings.pages.modules.pattern-disruptor.random.parts.adjective') }}
              <Checkbox v-model="settings.randomWords.partsOfSpeech.adjective" />
            </label>
            <label
              class="flex items-center justify-between gap-2 border border-neutral-200 rounded-lg px-3 py-2 text-sm dark:border-neutral-700"
            >
              {{ t('settings.pages.modules.pattern-disruptor.random.parts.adverb') }}
              <Checkbox v-model="settings.randomWords.partsOfSpeech.adverb" />
            </label>
          </div>

          <FieldValues
            v-model="settings.randomWords.blacklist"
            :label="t('settings.pages.modules.pattern-disruptor.random.blacklist.label')"
            :description="t('settings.pages.modules.pattern-disruptor.random.blacklist.description')"
            :value-placeholder="t('settings.pages.modules.pattern-disruptor.random.blacklist.placeholder')"
          />

          <FieldInput
            v-model="settings.randomWords.customPrompt"
            :label="t('settings.pages.modules.pattern-disruptor.random.prompt.label')"
            :description="t('settings.pages.modules.pattern-disruptor.random.prompt.description')"
            :single-line="false"
            :rows="4"
          />
        </div>
      </section>

      <section v-if="settings.enabled" class="border border-neutral-200 rounded-lg p-4 dark:border-neutral-700">
        <div class="mb-3 flex items-center justify-between gap-3">
          <label class="flex items-center gap-2 text-sm text-neutral-600 font-medium dark:text-neutral-300">
            <div i-solar:dictionary-bold-duotone />
            {{ t('settings.pages.modules.pattern-disruptor.synonyms.title') }}
          </label>
          <Checkbox v-model="settings.synonyms.enabled" />
        </div>

        <div v-if="settings.synonyms.enabled" class="flex flex-col gap-4">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FieldRange
              v-model="settings.synonyms.scanDepth"
              :label="t('settings.pages.modules.pattern-disruptor.synonyms.scan_depth.label')"
              :description="t('settings.pages.modules.pattern-disruptor.synonyms.scan_depth.description')"
              :min="1"
              :max="40"
              :step="1"
            />
            <FieldRange
              v-model="settings.synonyms.minOccurrences"
              :label="t('settings.pages.modules.pattern-disruptor.synonyms.min_occurrences.label')"
              :description="t('settings.pages.modules.pattern-disruptor.synonyms.min_occurrences.description')"
              :min="2"
              :max="20"
              :step="1"
            />
            <FieldRange
              v-model="settings.synonyms.topN"
              :label="t('settings.pages.modules.pattern-disruptor.synonyms.top_n.label')"
              :description="t('settings.pages.modules.pattern-disruptor.synonyms.top_n.description')"
              :min="1"
              :max="8"
              :step="1"
            />
            <div class="flex flex-col gap-2">
              <label class="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
                <div i-lucide:list-filter />
                {{ t('settings.pages.modules.pattern-disruptor.synonyms.output.label') }}
              </label>
              <Select v-model="settings.synonyms.outputMode" :options="synonymOutputOptions" class="w-full" />
            </div>
          </div>

          <FieldInput
            v-model="settings.synonyms.customPrompt"
            :label="t('settings.pages.modules.pattern-disruptor.synonyms.prompt.label')"
            :description="t('settings.pages.modules.pattern-disruptor.synonyms.prompt.description')"
            :single-line="false"
            :rows="4"
          />
          <FieldInput
            v-model="settings.synonyms.customPromptRow"
            :label="t('settings.pages.modules.pattern-disruptor.synonyms.row_prompt.label')"
            :description="t('settings.pages.modules.pattern-disruptor.synonyms.row_prompt.description')"
          />
        </div>
      </section>
    </div>
  </div>
</template>
