<script setup lang="ts">
import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'

const artistryStore = useArtistryStore()
const {
  openaiCompatibleImagesApiKey,
  openaiCompatibleImagesBaseUrl,
  openaiCompatibleImagesModel,
} = storeToRefs(artistryStore)
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
        OpenAI Compatible Images
      </h2>
      <div class="text-neutral-400 dark:text-neutral-500">
        Use any OpenAI-compatible /v1/images/generations endpoint. Paste base URL, API key, and model id.
      </div>
    </div>

    <div class="flex flex-col gap-4">
      <FieldInput
        v-model="openaiCompatibleImagesApiKey"
        label="API Key"
        description="Provider API key"
        placeholder="sk-..."
        type="password"
      />
      <FieldInput
        v-model="openaiCompatibleImagesBaseUrl"
        label="Base URL"
        description="Must end with /v1/"
        placeholder="https://openrouter.ai/api/v1/"
      />
      <FieldInput
        v-model="openaiCompatibleImagesModel"
        label="Model"
        description="Image model id"
        placeholder="google/gemini-2.5-flash-image"
      />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.artistry.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
