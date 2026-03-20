<script setup lang="ts">
import { FieldInput } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

const cardName = defineModel<string>('cardName', { required: true })
const cardNickname = defineModel<string>('cardNickname', { required: true })
const cardDescription = defineModel<string>('cardDescription', { required: true })
const cardNotes = defineModel<string>('cardNotes', { required: true })
const cardSystemPrompt = defineModel<string>('cardSystemPrompt', { required: true })
const cardPostHistoryInstructions = defineModel<string>('cardPostHistoryInstructions', { required: true })
const cardVersion = defineModel<string>('cardVersion', { required: true })

const { t } = useI18n()
</script>

<template>
  <div class="tab-content ml-auto mr-auto w-95%">
    <p class="mb-3">
      {{ t('settings.pages.card.creation.fields_info.subtitle') }}
    </p>

    <div class="input-list ml-auto mr-auto w-90% flex flex-row flex-wrap justify-start gap-8">
      <FieldInput v-model="cardName" :label="t('settings.pages.card.creation.name')" :description="t('settings.pages.card.creation.fields_info.name')" :required="true" />
      <FieldInput v-model="cardNickname" :label="t('settings.pages.card.creation.nickname')" :description="t('settings.pages.card.creation.fields_info.nickname')" />
      <FieldInput v-model="cardDescription" :label="t('settings.pages.card.creation.description')" :single-line="false" :required="true" :description="t('settings.pages.card.creation.fields_info.description')" />
      <FieldInput v-model="cardNotes" :label="t('settings.pages.card.creator_notes')" :single-line="false" :description="t('settings.pages.card.creation.fields_info.notes')" />
    </div>

    <div class="ml-auto mr-auto mt-8 w-90%">
      <p class="mb-3 text-sm text-neutral-500">
        {{ t('settings.pages.card.creation.fields_info.identity_prompting') }}
      </p>

      <div class="prompt-fields flex flex-col gap-8">
        <FieldInput
          v-model="cardSystemPrompt"
          :label="t('settings.pages.card.systemprompt')"
          :single-line="false"
          :required="true"
          :description="t('settings.pages.card.creation.fields_info.systemprompt')"
        />
        <FieldInput
          v-model="cardPostHistoryInstructions"
          :label="t('settings.pages.card.posthistoryinstructions')"
          :single-line="false"
          :required="true"
          :description="t('settings.pages.card.creation.fields_info.posthistoryinstructions')"
        />
        <div class="version-row">
          <FieldInput
            v-model="cardVersion"
            :label="t('settings.pages.card.creation.version')"
            :required="true"
            :description="t('settings.pages.card.creation.fields_info.version')"
          />
        </div>
      </div>
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

.version-row {
  width: 45%;
}

@media (max-width: 641px) {
  .version-row {
    width: 100%;
  }
}
</style>
