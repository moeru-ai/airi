<script setup lang="ts">
import type { PhoneticVocabularyEntry } from '@proj-airi/stage-ui/libs/voice/phonetic-vocabulary'

import { errorMessageFrom } from '@moeru/std'
import { kwsVocabulary } from '@proj-airi/stage-ui/libs/voice/kws-model'
import { english, pronounceEnglish } from '@proj-airi/stage-ui/libs/voice/phonetic-english'
import { mandarin, pronounceChinese } from '@proj-airi/stage-ui/libs/voice/phonetic-mandarin'
import { createPhoneticMatcher, selectSuggestions } from '@proj-airi/stage-ui/libs/voice/phonetic-match'
import { importVocabularyPack } from '@proj-airi/stage-ui/libs/voice/phonetic-vocabulary'
import { FieldRange, FieldTextArea } from '@proj-airi/ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/** The first test case of the feature: ASR often writes the Minecraft mob 硫方怪 as 流氓怪. */
const samplePack = {
  source: 'minecraft-wiki',
  entries: [
    { term: 'Sulfur Cube', writtenForms: ['硫方怪'], description: 'A cube-shaped Minecraft mob that lives near sulfur springs.' },
    { term: 'Creeper', writtenForms: ['苦力怕'], description: 'A green Minecraft mob that explodes near the player.' },
    // The CMU dictionary has no "Enderman", so the entry gives its ARPAbet phones.
    { term: 'Enderman', writtenForms: ['Enderman'], pronunciations: [['EH1', 'N', 'D', 'ER0', 'M', 'AE2', 'N']], description: 'A tall Minecraft mob that teleports and picks up blocks.' },
  ],
}

const transcript = ref('我刚才在温泉边遇到了一只流氓怪，后面还有个酷力爬. Then an end her man took a block.')
const packText = ref(JSON.stringify(samplePack, null, 2))
const threshold = ref(0.78)
const guessedThreshold = ref(0.7)

const pack = computed((): { entries: PhoneticVocabularyEntry[] } | { error: string } => {
  try {
    return { entries: importVocabularyPack(JSON.parse(packText.value), { vocabulary: kwsVocabulary, pronounce: text => pronounceChinese(text) ?? pronounceEnglish(text) }) }
  }
  catch (error) {
    return { error: errorMessageFrom(error) ?? t('tamagotchi.settings.devtools.pages.phonetic-match.pack.invalid') }
  }
})

const entries = computed(() => 'entries' in pack.value ? pack.value.entries : [])
const languages = [mandarin, english]
const tokens = computed(() => languages.flatMap(language => language.units(transcript.value)).map(run => run.map(unit => unit.tokens.join(' ')).join(' · ')))
const candidates = computed(() => createPhoneticMatcher(entries.value, languages, { threshold: threshold.value, guessedThreshold: guessedThreshold.value })(transcript.value))
const suggestions = computed(() => selectSuggestions(candidates.value))
const passing = computed(() => new Set(candidates.value.map(item => `${item.start}:${item.end}:${item.candidate}`)))
// A near-zero threshold keeps every reading, so a near miss shows how far it is from the threshold.
const nearest = computed(() => createPhoneticMatcher(entries.value, languages, { threshold: 0.01, guessedThreshold: 0.01, limit: 10 })(transcript.value))
</script>

<template>
  <div :class="['flex flex-col gap-6 pb-12']">
    <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      {{ t('tamagotchi.settings.devtools.pages.phonetic-match.description') }}
    </p>

    <FieldTextArea
      v-model="transcript"
      :label="t('tamagotchi.settings.devtools.pages.phonetic-match.transcript.title')"
      :description="t('tamagotchi.settings.devtools.pages.phonetic-match.transcript.description')"
      :required="false"
      :rows="3"
    />

    <div :class="['flex flex-col gap-2']">
      <FieldTextArea
        v-model="packText"
        :label="t('tamagotchi.settings.devtools.pages.phonetic-match.pack.title')"
        :description="t('tamagotchi.settings.devtools.pages.phonetic-match.pack.description')"
        :required="false"
        :rows="12"
        textarea-class="font-mono"
      />
      <div v-if="'error' in pack" :class="['text-sm text-red-600 dark:text-red-400']">
        {{ pack.error }}
      </div>
      <div v-else :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        {{ t('tamagotchi.settings.devtools.pages.phonetic-match.pack.entries', { count: entries.length }) }}
      </div>
    </div>

    <FieldRange
      v-model="threshold"
      :min="0.5"
      :max="1"
      :step="0.01"
      :default-value="0.78"
      as="div"
      :label="t('tamagotchi.settings.devtools.pages.phonetic-match.threshold.title')"
      :description="t('tamagotchi.settings.devtools.pages.phonetic-match.threshold.description')"
      :format-value="value => value.toFixed(2)"
    />

    <FieldRange
      v-model="guessedThreshold"
      :min="0.5"
      :max="1"
      :step="0.01"
      :default-value="0.7"
      as="div"
      :label="t('tamagotchi.settings.devtools.pages.phonetic-match.guessed-threshold.title')"
      :description="t('tamagotchi.settings.devtools.pages.phonetic-match.guessed-threshold.description')"
      :format-value="value => value.toFixed(2)"
    />

    <section :class="['flex flex-col gap-2']">
      <h2 :class="['text-sm font-medium']">
        {{ t('tamagotchi.settings.devtools.pages.phonetic-match.tokens.title') }}
      </h2>
      <code
        v-for="(run, index) in tokens"
        :key="index"
        :class="['rounded-lg bg-neutral-100 px-3 py-2 text-xs dark:bg-neutral-900']"
      >{{ run }}</code>
    </section>

    <section :class="['flex flex-col gap-2']">
      <h2 :class="['text-sm font-medium']">
        {{ t('tamagotchi.settings.devtools.pages.phonetic-match.suggestions.title') }}
      </h2>
      <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        {{ t('tamagotchi.settings.devtools.pages.phonetic-match.suggestions.description') }}
      </p>
      <div v-if="!suggestions.length" :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('tamagotchi.settings.devtools.pages.phonetic-match.suggestions.empty') }}
      </div>
      <div
        v-for="item in suggestions"
        :key="`${item.span}-${item.candidate}`"
        :class="['flex flex-col gap-1 rounded-lg border-2 border-neutral-100 border-solid px-3 py-2 dark:border-neutral-800']"
      >
        <div :class="['flex flex-wrap items-baseline gap-2']">
          <span :class="['font-medium']">{{ item.span }}</span>
          <span :class="['i-solar:arrow-right-linear text-neutral-400']" />
          <span :class="['font-medium text-primary-600 dark:text-primary-400']">{{ item.candidate }}</span>
          <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">{{ item.term }} · {{ item.score.toFixed(2) }} · {{ item.source }}</span>
        </div>
        <div :class="['text-sm text-neutral-600 dark:text-neutral-300']">
          {{ item.description }}
        </div>
      </div>
    </section>

    <section :class="['flex flex-col gap-2']">
      <h2 :class="['text-sm font-medium']">
        {{ t('tamagotchi.settings.devtools.pages.phonetic-match.nearest.title') }}
      </h2>
      <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        {{ t('tamagotchi.settings.devtools.pages.phonetic-match.nearest.description') }}
      </p>
      <div
        v-for="item in nearest"
        :key="`${item.start}:${item.end}:${item.candidate}`"
        :class="['flex flex-wrap items-baseline gap-2 text-sm', passing.has(`${item.start}:${item.end}:${item.candidate}`) ? '' : 'text-neutral-400 dark:text-neutral-500']"
      >
        <span>{{ item.span }}</span>
        <span :class="['i-solar:arrow-right-linear']" />
        <span>{{ item.candidate }}</span>
        <span :class="['font-mono text-xs']">{{ item.score.toFixed(2) }}</span>
      </div>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.devtools.pages.phonetic-match.title
  subtitleKey: tamagotchi.settings.devtools.title
</route>
