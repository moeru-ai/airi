<script setup lang="ts">
import { FieldInput, FieldValues } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'CardEditorBehaviorFields' })

const personality = defineModel<string>('personality', { required: true })
const scenario = defineModel<string>('scenario', { required: true })
const greetings = defineModel<string[]>('greetings', { required: true })

const { t } = useI18n()
</script>

<template>
  <div :class="['tab-content', 'mx-auto', 'w-95%']">
    <div :class="['card-editor-field-grid', 'mx-auto', 'w-90%', 'flex', 'flex-row', 'flex-wrap', 'justify-center', 'gap-8']">
      <FieldInput v-model="personality" :label="t('settings.pages.card.personality')" :single-line="false" :description="t('settings.pages.card.creation.fields_info.personality')" />
      <FieldInput v-model="scenario" :label="t('settings.pages.card.scenario')" :single-line="false" :description="t('settings.pages.card.creation.fields_info.scenario')" />
      <FieldValues v-model="greetings" :label="t('settings.pages.card.creation.greetings')" :description="t('settings.pages.card.creation.fields_info.greetings')" />
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
