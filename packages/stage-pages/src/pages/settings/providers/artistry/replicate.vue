<script setup lang="ts">
import { useArtistrySettingsStore } from '@proj-airi/stage-ui/stores/modules/artistry-settings'
import { FieldInput, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

const artistryStore = useArtistrySettingsStore()
const { t } = useI18n()

const {
  replicateApiKey,
  replicateDefaultModel,
  replicateAspectRatio,
  replicateInferenceSteps,
} = storeToRefs(artistryStore)
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
        {{ t('settings.pages.providers.provider.replicate.settings.heading') }}
      </h2>
      <div class="text-neutral-400 dark:text-neutral-500">
        {{ t('settings.pages.providers.provider.replicate.settings.description') }}
      </div>
    </div>

    <div class="flex flex-col gap-4">
      <FieldInput
        :model-value="replicateApiKey"
        :label="t('settings.pages.providers.provider.replicate.settings.api_key.label')"
        :description="t('settings.pages.providers.provider.replicate.settings.api_key.description')"
        :placeholder="t('settings.pages.providers.provider.replicate.settings.api_key.placeholder')"
        type="password"
        @update:model-value="artistryStore.setReplicateApiKey($event ?? '')"
      />

      <FieldInput
        :model-value="replicateDefaultModel"
        :label="t('settings.pages.providers.provider.replicate.settings.default_model.label')"
        :description="t('settings.pages.providers.provider.replicate.settings.default_model.description')"
        :placeholder="t('settings.pages.providers.provider.replicate.settings.default_model.placeholder')"
        @update:model-value="artistryStore.setReplicateDefaultModel($event ?? '')"
      />

      <FieldInput
        :model-value="replicateAspectRatio"
        :label="t('settings.pages.providers.provider.replicate.settings.aspect_ratio.label')"
        :description="t('settings.pages.providers.provider.replicate.settings.aspect_ratio.description')"
        :placeholder="t('settings.pages.providers.provider.replicate.settings.aspect_ratio.placeholder')"
        @update:model-value="artistryStore.setReplicateAspectRatio($event ?? '')"
      />

      <FieldRange
        :model-value="replicateInferenceSteps"
        :label="t('settings.pages.providers.provider.replicate.settings.inference_steps.label')"
        :description="t('settings.pages.providers.provider.replicate.settings.inference_steps.description')"
        :min="1"
        :max="50"
        :step="1"
        @update:model-value="artistryStore.setReplicateInferenceSteps"
      />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.providers.provider.replicate.settings.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
