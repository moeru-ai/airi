<script setup lang="ts">
import { wakeWordSequence } from '@proj-airi/stage-ui/services/wake-words'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { Button } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import WakeWordConflictDialog from '../../airi-card/components/WakeWordConflictDialog.vue'

const { t } = useI18n()
const { cards, wakeWordConflicts } = storeToRefs(useAiriCardStore())
const showConflicts = ref(false)
const cardEntries = computed(() => [...cards.value].map(([id, card]) => ({
  id,
  name: card.name,
  keywords: card.extensions.airi.modules.wakeWords?.keywords ?? [],
})))

function isActive(cardId: string, tokens: string[]) {
  const conflict = wakeWordConflicts.value.find(item => item.sequence === wakeWordSequence(tokens))
  return !conflict || conflict.ownerCardId === cardId
}
</script>

<template>
  <div :class="['flex flex-col gap-5']">
    <Button
      v-if="wakeWordConflicts.length"
      :label="t('settings.pages.modules.hearing.wake-words.review-conflicts')"
      @click="showConflicts = true"
    />
    <section
      v-for="card in cardEntries"
      :key="card.id"
      :class="['rounded-xl border border-solid border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900']"
    >
      <h2 :class="['mb-3 text-lg font-medium']">
        {{ card.name }}
      </h2>
      <p v-if="card.keywords.length === 0" :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.modules.hearing.wake-words.empty') }}
      </p>
      <div v-for="keyword in card.keywords" :key="keyword.label" :class="['mb-3']">
        <h3 :class="['font-medium']">
          {{ keyword.label }}
        </h3>
        <div v-for="match in keyword.matches" :key="wakeWordSequence(match.tokens)" :class="['mt-1 flex flex-wrap items-center gap-2']">
          <code :class="['break-all text-sm text-neutral-600 dark:text-neutral-300']">{{ wakeWordSequence(match.tokens) }}</code>
          <span :class="['text-xs', isActive(card.id, match.tokens) ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400']">
            {{ t(isActive(card.id, match.tokens) ? 'settings.pages.modules.hearing.wake-words.active' : 'settings.pages.modules.hearing.wake-words.paused') }}
          </span>
        </div>
      </div>
    </section>
    <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.pages.modules.hearing.wake-words.configure') }}
      <RouterLink to="/" :class="['text-primary-500 underline']">
        {{ t('settings.pages.modules.hearing.wake-words.open-chat') }}
      </RouterLink>
    </p>
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
