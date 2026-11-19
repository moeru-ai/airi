<script setup lang="ts">
import { useWakeWordsStore } from '@proj-airi/stage-ui/stores/wake-words'
import { Alert } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

const { t } = useI18n()
const wakeWords = useWakeWordsStore()
/** An imported or edited card can share a pronunciation with another card. Nobody answers it until the user chooses. */
const unresolved = computed(() => wakeWords.catalog.conflicts.filter(conflict => !conflict.owner).length)
</script>

<template>
  <Alert
    v-if="unresolved"
    data-testid="wake-word-conflict-alert"
    tone="warning"
    :title="t('settings.pages.card.wake-word-conflicts.title', { count: unresolved }, unresolved)"
  >
    <p>{{ t('settings.pages.card.wake-word-conflicts.description') }}</p>
    <p>
      <RouterLink to="/settings/modules/hearing/wake-words">
        {{ t('settings.pages.card.wake-word-conflicts.action') }}
      </RouterLink>
    </p>
  </Alert>
</template>
