<script setup lang="ts">
import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { FieldInput, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'

const artistryStore = useArtistryStore()

const {
  nanobananaApiKey,
  nanobananaModel,
  nanobananaResolution,
} = storeToRefs(artistryStore)

const modelOptions = [
  { label: 'Nano Banana 2 (Gemini 3.1 Flash Image)', value: 'gemini-3.1-flash-image-preview' },
  { label: 'Nano Banana Pro (Gemini 3 Pro Image)', value: 'gemini-3-pro-image-preview' },
  { label: 'Nano Banana (Gemini 2.5 Flash Image)', value: 'gemini-2.5-flash-image' },
]

const resolutionOptions = [
  { label: '1K', value: '1K' },
  { label: '2K', value: '2K' },
  { label: '4K', value: '4K' },
]
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="rounded-xl bg-amber-500/8 p-5 dark:bg-amber-500/12">
      <div class="mb-3 flex items-center gap-3">
        <div class="i-solar:gallery-round-bold-duotone text-3xl text-amber-500" />
        <div>
          <h2 class="text-xl text-neutral-800 font-semibold dark:text-neutral-100">
            Nano Banana (Google AI Studio)
          </h2>
          <p class="text-sm text-neutral-500 dark:text-neutral-400">
            Configure Google Gemini's native image generation capabilities.
          </p>
        </div>
      </div>
    </div>

    <div class="flex flex-col gap-4">
      <FieldInput
        v-model="nanobananaApiKey"
        label="API Key"
        description="Your Google AI Studio API Key"
        placeholder="AIpk..."
        type="password"
      />

      <FieldSelect
        v-model="nanobananaModel"
        label="Preferred Model"
        description="The specific Gemini image preview model to use"
        :options="modelOptions"
      />

      <FieldSelect
        v-model="nanobananaResolution"
        label="Default Resolution"
        description="The target resolution for generated images"
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
