<script setup lang="ts">
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useWakeWordsStore } from '@proj-airi/stage-ui/stores/wake-words'
import { Button, SettingsCard } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const cards = useAiriCardStore()
const wakeWords = useWakeWordsStore()

function characterName(characterId: string) {
  return cards.cards.get(characterId)?.name ?? characterId
}
</script>

<template>
  <SettingsCard v-if="wakeWords.catalog.conflicts.length" data-testid="wake-word-conflicts">
    <div>
      <h2 :class="['text-lg text-neutral-500 md:text-2xl dark:text-neutral-500']">
        {{ t('settings.pages.modules.hearing.wake-words.conflicts.title') }}
      </h2>
      <div :class="['text-neutral-400 dark:text-neutral-400']">
        {{ t('settings.pages.modules.hearing.wake-words.conflicts.description') }}
      </div>
    </div>

    <section
      v-for="conflict in wakeWords.catalog.conflicts"
      :key="conflict.key"
      data-testid="wake-word-conflict"
      :data-resolved="conflict.owner ? 'true' : 'false'"
      :class="[
        'flex flex-col gap-3 rounded-xl p-4',
        'bg-white dark:bg-neutral-900/60',
      ]"
    >
      <div :class="['flex flex-wrap items-center gap-2']">
        <code :class="['break-all rounded-md px-2 py-1 text-xs', 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200']">
          {{ conflict.candidates[0]?.tokens.join(' ') }}
        </code>
        <span
          v-if="conflict.owner"
          :class="['inline-flex items-center gap-1.5 text-sm', 'text-emerald-600 dark:text-emerald-400']"
        >
          <span :class="['i-solar:check-circle-line-duotone shrink-0']" />
          {{ t('settings.pages.modules.hearing.wake-words.conflicts.answered-by', { name: characterName(conflict.owner) }) }}
        </span>
        <span
          v-else
          :class="['inline-flex items-center gap-1.5 text-sm', 'text-amber-600 dark:text-amber-400']"
        >
          <span :class="['i-solar:pause-circle-line-duotone shrink-0']" />
          {{ t('settings.pages.modules.hearing.wake-words.conflicts.unresolved') }}
        </span>
      </div>

      <!-- The choice stays on this device. Both cards keep the pronunciation. The conflict stays listed, so the user can choose again. -->
      <div role="group" :aria-label="t('settings.pages.modules.hearing.wake-words.conflicts.choose-label')" :class="['flex flex-wrap gap-2']">
        <Button
          v-for="candidate in conflict.candidates"
          :key="candidate.characterId"
          :data-testid="`wake-word-owner-${candidate.characterId}`"
          size="sm"
          :color="conflict.owner === candidate.characterId ? 'primary' : 'neutral'"
          :variant="conflict.owner === candidate.characterId ? 'primary' : 'secondary'"
          :icon="conflict.owner === candidate.characterId ? 'i-solar:check-circle-bold' : undefined"
          :aria-pressed="conflict.owner === candidate.characterId"
          :label="t('settings.pages.modules.hearing.wake-words.conflicts.choose', { name: characterName(candidate.characterId), word: candidate.text })"
          @click="wakeWords.chooseOwner(conflict.key, candidate.characterId)"
        />
      </div>
    </section>
  </SettingsCard>
</template>
