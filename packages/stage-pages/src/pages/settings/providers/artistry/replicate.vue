<script setup lang="ts">
import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { FieldInput, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'

const artistryStore = useArtistryStore()

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
        Replicate.ai Configuration
      </h2>
      <div class="text-neutral-400 dark:text-neutral-500">
        Configure your cloud image generation settings.
      </div>
    </div>

    <div class="flex flex-col gap-4">
      <FieldInput
        v-model="replicateApiKey"
        label="API Key"
        description="Your Replicate API token (starts with r8_)"
        placeholder="r8_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
        type="password"
      />

      <FieldInput
        v-model="replicateDefaultModel"
        label="Default Model"
        description="Fallback owner/model string to use if the character card doesn't specify one"
        placeholder="black-forest-labs/flux-schnell"
      />

      <FieldInput
        v-model="replicateAspectRatio"
        label="Aspect Ratio"
        description="Default image aspect ratio (e.g. 16:9, 1:1, 9:16)"
        placeholder="16:9"
      />

      <FieldRange
        v-model="replicateInferenceSteps"
        label="Inference Steps"
        description="Number of steps for the diffusion process (lower is faster, higher is better quality)"
        :min="1"
        :max="50"
        :step="1"
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
