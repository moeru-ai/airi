<script setup lang="ts">
import { FieldInput } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

const cardName = defineModel<string>('cardName', { required: true })
const cardNickname = defineModel<string>('cardNickname', { required: true })
const cardDescription = defineModel<string>('cardDescription', { required: true })
const cardNotes = defineModel<string>('cardNotes', { required: true })

const { t } = useI18n()
</script>

<template>
  <div class="tab-content ml-auto mr-auto w-95%">
    <p class="mb-3">
      {{ t('settings.pages.card.creation.fields_info.subtitle') }}
    </p>

    <div class="input-list ml-auto mr-auto w-90% flex flex-row flex-wrap justify-center gap-8">
      <FieldInput v-model="cardName" :label="t('settings.pages.card.creation.name')" :description="t('settings.pages.card.creation.fields_info.name')" :required="true" />
      <FieldInput v-model="cardNickname" :label="t('settings.pages.card.creation.nickname')" :description="t('settings.pages.card.creation.fields_info.nickname')" />
      <FieldInput v-model="cardDescription" :label="t('settings.pages.card.creation.description')" :single-line="false" :required="true" :description="t('settings.pages.card.creation.fields_info.description')" />
      <FieldInput v-model="cardNotes" :label="t('settings.pages.card.creator_notes')" :single-line="false" :description="t('settings.pages.card.creation.fields_info.notes')" />
    </div>
  </div>
</template>

<style scoped>
.input-list > * {
  min-width: 45%;
}

@media (max-width: 641px) {
  .input-list * {
    min-width: unset;
    width: 100%;
  }
}
</style>
