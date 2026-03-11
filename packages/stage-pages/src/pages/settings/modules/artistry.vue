<script setup lang="ts">
import { RadioCardSimple } from '@proj-airi/stage-ui/components'
import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
const artistryStore = useArtistryStore()
const { activeProvider } = storeToRefs(artistryStore)

const availableProviders = [
  {
    id: 'comfyui',
    name: 'ComfyUI (Local)',
    description: 'Use a local ComfyUI instance via WSL for image generation.',
    icon: 'i-solar:monitor-camera-bold-duotone',
    configRoute: '/settings/providers/artistry/comfyui',
  },
  {
    id: 'replicate',
    name: 'Replicate.ai (Cloud)',
    description: 'Use cloud-based models via the Replicate API.',
    icon: 'i-solar:cloud-upload-bold-duotone',
    configRoute: '/settings/providers/artistry/replicate',
  },
]
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="h-fit w-full flex flex-col gap-4 rounded-xl bg-neutral-100 p-4 dark:bg-[rgba(0,0,0,0.3)]">
      <div>
        <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
          Artistry Provider Configuration
        </h2>
        <div class="text-neutral-400 dark:text-neutral-500">
          Select the active backend provider for image generation. Characters can override this in their Card settings.
        </div>
      </div>

      <div class="max-w-full">
        <fieldset
          class="min-w-0 flex flex-row gap-4 overflow-x-scroll scroll-smooth"
          style="scrollbar-width: none;"
          role="radiogroup"
        >
          <RadioCardSimple
            v-for="provider in availableProviders"
            :id="provider.id"
            :key="provider.id"
            v-model="activeProvider"
            name="artistry-provider"
            :value="provider.id"
            :title="provider.name"
            :description="provider.description"
            @click="router.push(provider.configRoute)"
          />
        </fieldset>
      </div>
    </div>
  </div>

  <div
    v-motion
    class="pointer-events-none fixed bottom-0 right-[-1.25rem] top-[calc(100dvh-15rem)] z-[-1] size-60 flex items-center justify-center text-neutral-200/50 dark:text-neutral-600/20"
    :initial="{ scale: 0.9, opacity: 0, x: 20 }"
    :enter="{ scale: 1, opacity: 1, x: 0 }"
    :duration="500"
  >
    <div class="i-solar:gallery-bold-duotone text-[60px]" />
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
