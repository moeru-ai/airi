<script setup lang="ts">
import { FieldInput } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

const cardSystemPrompt = defineModel<string>('cardSystemPrompt', { required: true })
const cardPostHistoryInstructions = defineModel<string>('cardPostHistoryInstructions', { required: true })
const cardVersion = defineModel<string>('cardVersion', { required: true })

const { t } = useI18n()
</script>

<template>
  <div class="tab-content ml-auto mr-auto w-95%">
    <div class="input-list ml-auto mr-auto w-90% flex flex-row flex-wrap justify-center gap-8">
      <FieldInput v-model="cardSystemPrompt" :label="t('settings.pages.card.systemprompt')" :single-line="false" :required="true" :description="t('settings.pages.card.creation.fields_info.systemprompt')" />
      <FieldInput v-model="cardPostHistoryInstructions" :label="t('settings.pages.card.posthistoryinstructions')" :single-line="false" :required="true" :description="t('settings.pages.card.creation.fields_info.posthistoryinstructions')" />
      <FieldInput v-model="cardVersion" :label="t('settings.pages.card.creation.version')" :required="true" :description="t('settings.pages.card.creation.fields_info.version')" />
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
