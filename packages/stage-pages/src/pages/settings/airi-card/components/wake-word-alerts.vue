<script setup lang="ts">
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { Button, Callout } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import WakeWordConflictDialog from './wake-word-conflict-dialog.vue'

const emit = defineEmits<{ reviewCard: [cardId: string] }>()
const showConflicts = defineModel<boolean>({ required: true })
const { cards, wakeWordConflicts, wakeWordValidationIssues } = storeToRefs(useAiriCardStore())
const { t } = useI18n()
const unresolvedCount = computed(() => wakeWordConflicts.value.filter(conflict => !conflict.ownerCardId).length)
</script>

<template>
  <Callout
    v-for="[cardId, reason] in wakeWordValidationIssues"
    :key="cardId"
    theme="orange"
    :label="t('settings.pages.card.wake-word-validation.invalid', { name: cards.get(cardId)?.name, reason })"
  >
    <Button
      :label="t('settings.pages.card.wake-word-validation.review')"
      @click="emit('reviewCard', cardId)"
    />
  </Callout>
  <Callout
    v-if="unresolvedCount"
    theme="orange"
    :label="t('settings.pages.card.wake-word-conflict.unresolved', { count: unresolvedCount })"
  >
    <Button
      :label="t('settings.pages.card.wake-word-conflict.review')"
      @click="showConflicts = true"
    />
  </Callout>
  <WakeWordConflictDialog v-model="showConflicts" />
</template>
