<script setup lang="ts">
import { FieldCheckbox, FieldInput, FieldTextArea, Select } from '@proj-airi/ui'

defineProps<{
  providerOptions: { value: string, label: string }[]
  modelOptions: { value: string, label: string }[]
  providerPlaceholder: string
  modelPlaceholder: string
}>()

const generationEnabled = defineModel<boolean>('generationEnabled', { required: true })
const generationProvider = defineModel<string>('generationProvider', { required: true })
const generationModel = defineModel<string>('generationModel', { required: true })
const generationMaxTokens = defineModel<number | undefined>('generationMaxTokens', { required: true })
const generationTemperature = defineModel<number | undefined>('generationTemperature', { required: true })
const generationTopP = defineModel<number | undefined>('generationTopP', { required: true })
const generationAdvancedJson = defineModel<string>('generationAdvancedJson', { required: true })
</script>

<template>
  <div class="tab-content ml-auto mr-auto w-95%">
    <p class="mb-3">
      Tune per-character response generation without changing the rest of the app. This first pass focuses on the most common chat controls and saves them with the AIRI card.
    </p>

    <div class="mx-auto mb-6 w-90% border border-amber-200 rounded-xl bg-amber-50/80 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
      Keys that work for one provider or model may be ignored or rejected by another. Start simple, and treat these as character-specific generation defaults rather than guaranteed cross-provider behavior.
    </div>

    <div class="mx-auto mb-6 w-90%">
      <FieldCheckbox
        v-model="generationEnabled"
        label="Use character-specific generation settings"
        description="When disabled, this card inherits the global chat generation defaults."
      />
    </div>

    <div class="input-list ml-auto mr-auto w-90% flex flex-row flex-wrap justify-start gap-8" :class="[!generationEnabled ? 'pointer-events-none opacity-50' : '']">
      <div class="field-block">
        <label class="mb-2 flex flex-row items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
          <div i-lucide:brain />
          Provider
        </label>
        <Select
          v-model="generationProvider"
          :options="providerOptions"
          :placeholder="providerPlaceholder"
          class="w-full"
        />
      </div>

      <div class="field-block">
        <label class="mb-2 flex flex-row items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
          <div i-lucide:ghost />
          Model
        </label>
        <Select
          v-model="generationModel"
          :options="modelOptions"
          :placeholder="modelPlaceholder"
          class="w-full"
        />
      </div>

      <FieldInput
        v-model="generationMaxTokens"
        class="field-block"
        label="Max Tokens"
        description="Cap the model's reply length for this character."
        type="number"
        placeholder="500"
      />

      <FieldInput
        v-model="generationTemperature"
        class="field-block"
        label="Temperature"
        description="Higher values are more random; lower values are more deterministic."
        type="number"
        placeholder="0.8"
      />

      <FieldInput
        v-model="generationTopP"
        class="field-block"
        label="Top P"
        description="Nucleus sampling cutoff for this character's replies."
        type="number"
        placeholder="0.9"
      />

      <FieldTextArea
        v-model="generationAdvancedJson"
        class="advanced-block"
        label="Advanced JSON"
        description="Optional raw request fields for provider-specific tuning. These keys are merged into the outbound request when Generation is enabled."
        placeholder="{&#10;  &quot;thinking&quot;: { &quot;type&quot;: &quot;disabled&quot; }&#10;}"
        :rows="8"
      />
    </div>
  </div>
</template>

<style scoped>
.input-list > * {
  min-width: 45%;
}

.field-block {
  width: 45%;
}

.advanced-block {
  width: 100%;
}

@media (max-width: 641px) {
  .input-list > * {
    min-width: unset;
    width: 100%;
  }

  .field-block {
    width: 100%;
  }
}
</style>
