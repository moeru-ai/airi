<script setup lang="ts">
import type { WakeWordKeyword } from '@proj-airi/stage-ui/types/airiCard'

import { pinnedKwsVocabulary, supportedWakeWordKeywords, wakeWordSequence } from '@proj-airi/stage-ui/services/wake-words'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { Button, Callout } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import WakeWordConflictDialog from '../../airi-card/components/wake-word-conflict-dialog.vue'

const { t } = useI18n()
const { cards, wakeWordConflicts, wakeWordValidationIssues } = storeToRefs(useAiriCardStore())
const showConflicts = shallowRef(false)
const emptyKeywords: WakeWordKeyword[] = []
const cardEntries = computed(() => [...cards.value].map(([id, card]) => ({
  id,
  name: card.name,
  // Imported pronunciations remain on the card. Only valid model tokens appear as active choices.
  keywords: card.extensions.airi.modules.wakeWords
    ? supportedWakeWordKeywords(card.extensions.airi.modules.wakeWords.keywords, pinnedKwsVocabulary)
    : emptyKeywords,
  issue: wakeWordValidationIssues.value.get(id),
})))

function isActive(cardId: string, tokens: string[]) {
  const conflict = wakeWordConflicts.value.find(item => item.sequence === wakeWordSequence(tokens))
  return !conflict || conflict.ownerCardId === cardId
}
</script>

<template>
  <div :class="['flex flex-col gap-6']">
    <Callout :label="t('settings.pages.modules.hearing.wake-words.title')">
      {{ t('settings.pages.modules.hearing.wake-words.configure') }}
      <RouterLink to="/" :class="['text-primary-600 underline underline-offset-2 dark:text-primary-300']">
        {{ t('settings.pages.modules.hearing.wake-words.open-chat') }}
      </RouterLink>
    </Callout>
    <Button
      v-if="wakeWordConflicts.length"
      :label="t('settings.pages.modules.hearing.wake-words.review-conflicts')"
      :class="['self-start']"
      @click="showConflicts = true"
    />
    <section
      v-for="card in cardEntries"
      :key="card.id"
      :class="['flex flex-col gap-4 rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]']"
    >
      <h2 :class="['text-lg text-neutral-600 font-medium dark:text-neutral-300']">
        {{ card.name }}
      </h2>
      <Callout v-if="card.issue" theme="orange" :label="t('settings.pages.card.wake-word-validation.invalid', { name: card.name, reason: card.issue })" />
      <p v-else-if="card.keywords.length === 0" :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.modules.hearing.wake-words.empty') }}
      </p>
      <div v-for="keyword in card.keywords" :key="keyword.label" :class="['flex flex-col gap-2']">
        <h3 :class="['font-medium text-neutral-800 dark:text-neutral-100']">
          {{ keyword.label }}
        </h3>
        <div v-for="match in keyword.matches" :key="wakeWordSequence(match.tokens)" :class="['flex flex-wrap items-center gap-2']">
          <code :class="['break-all rounded-md bg-neutral-100 px-2 py-1 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300']">{{ wakeWordSequence(match.tokens) }}</code>
          <span :class="['inline-flex items-center gap-1.5 text-xs', isActive(card.id, match.tokens) ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400']">
            <span :class="['size-1.5 rounded-full bg-current']" aria-hidden="true" />
            {{ t(isActive(card.id, match.tokens) ? 'settings.pages.modules.hearing.wake-words.active' : 'settings.pages.modules.hearing.wake-words.paused') }}
          </span>
        </div>
      </div>
    </section>
    <WakeWordConflictDialog v-model="showConflicts" />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.hearing.wake-words.title
  subtitleKey: settings.pages.modules.hearing.title
  stageTransition:
    name: slide
</route>
