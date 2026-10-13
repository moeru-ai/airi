<script setup lang="ts">
import { useWakeWordsStore } from '@proj-airi/stage-ui/stores/wake-words'
import { Callout } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

const { t } = useI18n()
const wakeWords = useWakeWordsStore()
/** An imported or edited card can share a pronunciation with another card. Nobody answers it until the user chooses. */
const unresolved = computed(() => wakeWords.catalog.conflicts.filter(conflict => !conflict.owner).length)
</script>

<template>
  <Callout
    v-if="unresolved"
    data-testid="wake-word-conflict-alert"
    theme="orange"
    :label="t('settings.pages.card.wake-word-conflicts.title', { count: unresolved }, unresolved)"
  >
    <div :class="['flex flex-col items-start gap-2']">
      <span>{{ t('settings.pages.card.wake-word-conflicts.description') }}</span>
      <RouterLink
        to="/settings/modules/hearing/wake-words"
        :class="['font-medium text-primary-600 underline underline-offset-2 dark:text-primary-300']"
      >
        {{ t('settings.pages.card.wake-word-conflicts.action') }}
      </RouterLink>
    </div>
  </Callout>
</template>
