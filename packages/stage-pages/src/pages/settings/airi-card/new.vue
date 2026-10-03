<script setup lang="ts">
import CardEditor from './components/CardEditor.vue'
import UnsavedChangesDialog from './components/UnsavedChangesDialog.vue'

import { useAiriCardEditorPage } from './composables/use-airi-card-editor-page'

const {
  isDirty,
  showUnsavedChangesDialog,
  initialSection,
  handleBack,
  handleSectionChange,
  handleDiscardChanges,
  handleCancelDiscard,
  handleSaved,
} = useAiriCardEditorPage()
</script>

<template>
  <CardEditor
    v-model:dirty="isDirty"
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
  titleKey: settings.pages.card.create_card
  stageTransition:
    name: slide
</route>
