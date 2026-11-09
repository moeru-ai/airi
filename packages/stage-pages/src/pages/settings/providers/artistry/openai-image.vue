<script setup lang="ts">
import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { Alert, Button, FieldInput, SettingsCard } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const store = useArtistryStore()
const { openaiImageApiKey, openaiImageBaseUrl, openaiImageModel, openaiImageWidth, openaiImageHeight } = storeToRefs(store)

// Dimension edits stay local until a complete valid pair is explicitly saved.
const widthDraft = ref<string | number>(openaiImageWidth.value)
const heightDraft = ref<string | number>(openaiImageHeight.value)
const invalidDimensions = computed(() => {
  if (widthDraft.value === '' && heightDraft.value === '')
    return false
  return [Number(widthDraft.value), Number(heightDraft.value)]
    .some(value => !Number.isSafeInteger(value) || value <= 0 || value % 16 !== 0)
})
const dimensionsChanged = computed(() => String(widthDraft.value) !== openaiImageWidth.value || String(heightDraft.value) !== openaiImageHeight.value)

// Store resets and remote snapshots refresh only the local form, without writing synchronized state.
watch([openaiImageWidth, openaiImageHeight], ([width, height]) => {
  widthDraft.value = width
  heightDraft.value = height
})

function saveDimensions() {
  if (invalidDimensions.value)
    return
  store.$patch({ openaiImageWidth: String(widthDraft.value), openaiImageHeight: String(heightDraft.value) })
}
</script>

<template>
  <SettingsCard>
    <FieldInput
      v-model="openaiImageApiKey"
      type="password"
      :label="t('settings.pages.providers.provider.openai-image.api-key.label')"
      :description="t('settings.pages.providers.provider.openai-image.api-key.description')"
      :placeholder="t('settings.pages.providers.provider.openai-image.api-key.placeholder')"
    />
    <FieldInput
      v-model="openaiImageBaseUrl"
      :label="t('settings.pages.providers.provider.openai-image.base-url.label')"
      :description="t('settings.pages.providers.provider.openai-image.base-url.description')"
      placeholder="https://api.openai.com/v1/"
    />
    <FieldInput
      v-model="openaiImageModel"
      :label="t('settings.pages.providers.provider.openai-image.model.label')"
      :description="t('settings.pages.providers.provider.openai-image.model.description')"
      placeholder="gpt-image-2.6-sunburst"
    />
    <FieldInput
      v-model="widthDraft"
      type="number"
      :label="t('settings.pages.providers.provider.openai-image.dimensions.width')"
      :description="t('settings.pages.providers.provider.openai-image.dimensions.description')"
      :placeholder="t('settings.pages.providers.provider.openai-image.dimensions.placeholder')"
    />
    <FieldInput
      v-model="heightDraft"
      type="number"
      :label="t('settings.pages.providers.provider.openai-image.dimensions.height')"
      :placeholder="t('settings.pages.providers.provider.openai-image.dimensions.placeholder')"
    />
    <Alert
      v-if="invalidDimensions"
      tone="warning"
      :title="t('settings.pages.providers.provider.openai-image.dimensions.invalid')"
    />
    <Button
      variant="primary"
      color="primary"
      :disabled="invalidDimensions || !dimensionsChanged"
      @click="saveDimensions"
    >
      {{ t('settings.pages.providers.provider.openai-image.dimensions.save') }}
    </Button>
  </SettingsCard>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.providers.provider.openai-image.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
