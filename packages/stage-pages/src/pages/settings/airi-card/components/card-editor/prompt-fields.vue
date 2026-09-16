<script setup lang="ts">
import { FieldInput } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'CardEditorPromptFields' })

const systemPrompt = defineModel<string>('systemPrompt', { required: true })
const postHistoryInstructions = defineModel<string>('postHistoryInstructions', { required: true })
const version = defineModel<string>('version', { required: true })

const { t } = useI18n()
</script>

<template>
  <div :class="['tab-content', 'mx-auto', 'w-95%']">
    <div :class="['card-editor-field-grid', 'mx-auto', 'w-90%', 'flex', 'flex-row', 'flex-wrap', 'justify-center', 'gap-8']">
      <FieldInput v-model="systemPrompt" :label="t('settings.pages.card.systemprompt')" :single-line="false" :description="t('settings.pages.card.creation.fields_info.systemprompt')" />
      <FieldInput v-model="postHistoryInstructions" :label="t('settings.pages.card.posthistoryinstructions')" :single-line="false" :description="t('settings.pages.card.creation.fields_info.posthistoryinstructions')" />
      <FieldInput v-model="version" :label="t('settings.pages.card.creation.version')" :required="true" :description="t('settings.pages.card.creation.fields_info.version')" />
    </div>
  </div>
</template>

<style scoped>
.card-editor-field-grid > * {
  min-width: 45%;
}

@media (max-width: 641px) {
  .card-editor-field-grid > * {
    min-width: unset;
    width: 100%;
  }
}
</style>
