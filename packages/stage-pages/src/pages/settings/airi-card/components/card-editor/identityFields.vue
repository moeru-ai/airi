<script setup lang="ts">
import { FieldInput } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'CardEditorIdentityFields' })

const name = defineModel<string>('name', { required: true })
const nickname = defineModel<string>('nickname', { required: true })
const description = defineModel<string>('description', { required: true })
const notes = defineModel<string>('notes', { required: true })

const { t } = useI18n()
</script>

<template>
  <div :class="['tab-content', 'mx-auto', 'w-95%']">
    <p class="mb-3">
      {{ t('settings.pages.card.creation.fields_info.subtitle') }}
    </p>

    <div :class="['card-editor-field-grid', 'mx-auto', 'w-90%', 'flex', 'flex-row', 'flex-wrap', 'justify-center', 'gap-8']">
      <FieldInput v-model="name" :label="t('settings.pages.card.creation.name')" :description="t('settings.pages.card.creation.fields_info.name')" :required="true" />
      <FieldInput v-model="nickname" :label="t('settings.pages.card.creation.nickname')" :description="t('settings.pages.card.creation.fields_info.nickname')" />
      <FieldInput v-model="description" :label="t('settings.pages.card.creation.description')" :single-line="false" :description="t('settings.pages.card.creation.fields_info.description')" />
      <FieldInput v-model="notes" :label="t('settings.pages.card.creator_notes')" :single-line="false" :description="t('settings.pages.card.creation.fields_info.notes')" />
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
