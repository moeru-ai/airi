<script setup lang="ts">
import { FieldInput, FieldValues } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

const cardPersonality = defineModel<string>('cardPersonality', { required: true })
const cardScenario = defineModel<string>('cardScenario', { required: true })
const cardGreetings = defineModel<string[]>('cardGreetings', { required: true })

const { t } = useI18n()
</script>

<template>
  <div class="tab-content ml-auto mr-auto w-95%">
    <div class="input-list ml-auto mr-auto w-90% flex flex-row flex-wrap justify-center gap-8">
      <FieldInput v-model="cardPersonality" :label="t('settings.pages.card.personality')" :single-line="false" :required="true" :description="t('settings.pages.card.creation.fields_info.personality')" />
      <FieldInput v-model="cardScenario" :label="t('settings.pages.card.scenario')" :single-line="false" :required="true" :description="t('settings.pages.card.creation.fields_info.scenario')" />
      <FieldValues v-model="cardGreetings" :label="t('settings.pages.card.creation.greetings')" :description="t('settings.pages.card.creation.fields_info.greetings')" />
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
