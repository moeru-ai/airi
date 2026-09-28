<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import CardEditor from '../components/CardEditor.vue'
import UnsavedChangesDialog from '../components/UnsavedChangesDialog.vue'

import { useAiriCardEditorPage } from '../composables/use-airi-card-editor-page'

const route = useRoute()
const cardId = computed(() => String(route.params.cardId ?? ''))
const {
  isDirty,
  showUnsavedChangesDialog,
  initialSection,
  handleBack,
  handleSectionChange,
  handleDiscardChanges,
  handleCancelDiscard,
  handleSaved,
} = useAiriCardEditorPage({ cardId })
</script>

<template>
  <CardEditor
    v-model:dirty="isDirty"
    :card-id="cardId"
    :initial-section="initialSection"
    @back="handleBack"
    @saved="handleSaved"
    @update:section="handleSectionChange"
  />

  <UnsavedChangesDialog
    v-model="showUnsavedChangesDialog"
    @discard="handleDiscardChanges"
    @cancel="handleCancelDiscard"
  />
</template>

<route lang="yaml">
meta:
  layout: plain
  titleKey: settings.pages.card.edit_card
  stageTransition:
    name: slide
</route>
