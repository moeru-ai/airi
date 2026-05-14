<script setup lang="ts">
import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { FieldInput, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const artistryStore = useArtistryStore()
const { t } = useI18n()

const {
  nanobananaApiKey,
  nanobananaModel,
  nanobananaResolution,
} = storeToRefs(artistryStore)

const modelOptions = computed(() => [
  { label: t('settings.pages.providers.provider.nanobanana.settings.model_options.nano_banana_2'), value: 'gemini-3.1-flash-image-preview' },
  { label: t('settings.pages.providers.provider.nanobanana.settings.model_options.nano_banana_pro'), value: 'gemini-3-pro-image-preview' },
  { label: t('settings.pages.providers.provider.nanobanana.settings.model_options.nano_banana'), value: 'gemini-2.5-flash-image' },
])

const resolutionOptions = computed(() => [
  { label: '1K', value: '1K' },
  { label: '2K', value: '2K' },
  { label: '4K', value: '4K' },
])
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="rounded-xl bg-amber-500/8 p-5 dark:bg-amber-500/12">
      <div class="mb-3 flex items-center gap-3">
        <div class="i-solar:gallery-round-bold-duotone text-3xl text-amber-500" />
        <div>
          <h2 class="text-xl text-neutral-800 font-semibold dark:text-neutral-100">
            {{ t('settings.pages.providers.provider.nanobanana.settings.heading') }}
          </h2>
          <p class="text-sm text-neutral-500 dark:text-neutral-400">
            {{ t('settings.pages.providers.provider.nanobanana.settings.description') }}
          </p>
        </div>
      </div>
    </div>

    <div class="flex flex-col gap-4">
      <FieldInput
        v-model="nanobananaApiKey"
        :label="t('settings.pages.providers.provider.nanobanana.settings.api_key.label')"
        :description="t('settings.pages.providers.provider.nanobanana.settings.api_key.description')"
        :placeholder="t('settings.pages.providers.provider.nanobanana.settings.api_key.placeholder')"
        type="password"
      />

      <FieldSelect
        v-model="nanobananaModel"
        :label="t('settings.pages.providers.provider.nanobanana.settings.preferred_model.label')"
        :description="t('settings.pages.providers.provider.nanobanana.settings.preferred_model.description')"
        :options="modelOptions"
      />

      <FieldSelect
        v-model="nanobananaResolution"
        :label="t('settings.pages.providers.provider.nanobanana.settings.default_resolution.label')"
        :description="t('settings.pages.providers.provider.nanobanana.settings.default_resolution.description')"
        :options="resolutionOptions"
      />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.providers.provider.nanobanana.settings.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
