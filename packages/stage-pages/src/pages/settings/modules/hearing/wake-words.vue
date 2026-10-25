<script setup lang="ts">
import type { WakeWord } from '@proj-airi/stage-ui/libs/voice/wake-words'

import { WakeWordStatus } from '@proj-airi/stage-ui/components'
import { wakeWordKey } from '@proj-airi/stage-ui/libs/voice/wake-words'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useWakeWordDetectionStore } from '@proj-airi/stage-ui/stores/wake-word-detection'
import { useWakeWordsStore } from '@proj-airi/stage-ui/stores/wake-words'
import { SettingsCard } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import WakeWordConflicts from '../components/wake-word-conflicts.vue'

import { wakeWordSearchKey } from './wake-words.search'

/**
 * How one card pronunciation behaves on this device.
 *
 * - `active`: the detector listens for it, and a match wakes this character.
 * - `paused`: another card shares it and no character was chosen, so nobody answers it.
 * - `other`: another card shares it and the device chose that character.
 * - `unsupported`: the pronunciation belongs to another keyword model, so the detector skips it.
 */
type PronunciationState = 'active' | 'paused' | 'other' | 'unsupported'

/** Cards without wake words share one immutable empty list. */
const NO_WAKE_WORDS: readonly WakeWord[] = Object.freeze([])

const { t } = useI18n()
const cards = useAiriCardStore()
const wakeWords = useWakeWordsStore()
const detection = useWakeWordDetectionStore()

const characters = computed(() => {
  const conflicts = new Map(wakeWords.catalog.conflicts.map(conflict => [conflict.key, conflict]))
  // The detector runs only pronunciations of its pinned model. These keys come from the active catalog.
  const detected = new Set(detection.pronunciations.map(pronunciation => pronunciation.key))

  function stateOf(characterId: string, key: string): { state: PronunciationState, owner?: string } {
    const conflict = conflicts.get(key)
    if (conflict && !conflict.owner)
      return { state: 'paused' }
    if (conflict && conflict.owner !== characterId)
      return { state: 'other', owner: conflict.owner }
    return { state: detected.has(key) ? 'active' : 'unsupported' }
  }

  return [...cards.cards].map(([id, card]) => ({
    id,
    name: card.name,
    words: (card.extensions.airi.wakeWords ?? NO_WAKE_WORDS).map(word => ({
      text: word.text,
      pronunciations: word.pronunciations.map((tokens) => {
        const key = wakeWordKey(word.modelId, tokens)
        return { key, tokens: tokens.join(' '), ...stateOf(id, key) }
      }),
    })),
  }))
})

function characterName(characterId: string) {
  return cards.cards.get(characterId)?.name ?? characterId
}

const stateClasses: Record<PronunciationState, string[]> = {
  active: ['text-emerald-600 dark:text-emerald-400'],
  paused: ['text-amber-600 dark:text-amber-400'],
  other: ['text-neutral-500 dark:text-neutral-400'],
  unsupported: ['text-neutral-500 dark:text-neutral-400'],
}
</script>

<template>
  <div :class="['flex flex-col gap-6']">
    <SettingsCard>
      <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.modules.hearing.wake-words.intro') }}
      </p>
      <WakeWordStatus />
    </SettingsCard>

    <WakeWordConflicts />

    <div :class="['grid grid-cols-1 gap-4 md:grid-cols-2']">
      <SettingsCard
        v-for="character in characters"
        :key="character.id"
        data-testid="wake-word-character"
        :data-character-id="character.id"
      >
        <h2 :class="['text-lg text-neutral-700 font-medium dark:text-neutral-200']">
          {{ character.name }}
        </h2>
        <p v-if="character.words.length === 0" :class="['text-sm text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.pages.modules.hearing.wake-words.empty') }}
        </p>
        <div v-for="word in character.words" :key="word.text" :data-settings-search="wakeWordSearchKey(character.id, word.text)" :class="['flex flex-col gap-2']">
          <h3 :class="['font-medium text-neutral-800 dark:text-neutral-100']">
            {{ word.text }}
          </h3>
          <div
            v-for="pronunciation in word.pronunciations"
            :key="pronunciation.key"
            data-testid="wake-word-pronunciation"
            :data-state="pronunciation.state"
            :class="['flex flex-wrap items-center gap-2']"
          >
            <code :class="['break-all rounded-md px-2 py-1 text-xs', 'bg-white text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300']">
              {{ pronunciation.tokens }}
            </code>
            <span :class="['inline-flex items-center gap-1.5 text-xs', stateClasses[pronunciation.state]]">
              <span aria-hidden="true" :class="['size-1.5 rounded-full bg-current']" />
              {{ pronunciation.owner
                ? t('settings.pages.modules.hearing.wake-words.state.other', { name: characterName(pronunciation.owner) })
                : t(`settings.pages.modules.hearing.wake-words.state.${pronunciation.state}`) }}
            </span>
          </div>
        </div>
      </SettingsCard>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.hearing.wake-words.title
  subtitleKey: settings.pages.modules.hearing.title
  icon: i-solar:bell-bing-bold-duotone
  stageTransition:
    name: slide
</route>
