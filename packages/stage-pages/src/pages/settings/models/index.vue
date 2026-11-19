<script setup lang="ts">
import { ModelSettings, ModelSettingsMobile } from '@proj-airi/stage-ui/components/scenarios/settings/model-settings'
import { useBreakpoints } from '@proj-airi/stage-ui/composables/use-breakpoints'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { Vibrant } from 'node-vibrant/browser'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

const modelSettingsRef = ref<{ capturePreviewFrame: () => Promise<Blob | undefined> }>()
const palette = ref<string[]>([])

const { isMobile } = useBreakpoints()
const { stageModelRenderer } = storeToRefs(useSettings())
/**
 * Phones edit a Live2D model with the stage-first editor. Wider screens and the other renderers keep the panel
 * beside the preview.
 */
const usesMobileEditor = computed(() => isMobile.value && stageModelRenderer.value === 'live2d')

async function extractColorsFromModel() {
  const frame = await modelSettingsRef.value?.capturePreviewFrame()
  if (!frame) {
    console.error('No frame captured')
    return
  }

  const frameUrl = URL.createObjectURL(frame)
  try {
    const vibrant = new Vibrant(frameUrl)

    const paletteFromVibrant = await vibrant.getPalette()
    palette.value = Object.values(paletteFromVibrant).map(color => color?.hex).filter(it => typeof it === 'string')
  }
  finally {
    URL.revokeObjectURL(frameUrl)
  }
}
</script>

<template>
  <ModelSettingsMobile
    v-if="usesMobileEditor"
    ref="modelSettingsRef"
    :palette="palette"
    @extract-colors-from-model="extractColorsFromModel"
  />
  <template v-else>
    <div flex class="relative h-full flex-col-reverse md:flex-row">
      <ModelSettings
        ref="modelSettingsRef"
        settings-class="w-100% md:w-40% lg:w-40% xl:w-25% 2xl:w-30% h-fit sm:max-h-80dvh relative"
        live-2d-scene-class="absolute max-h-[calc(100dvh-100px-56px)] w-full h-full"
        vrm-scene-class="absolute max-h-[calc(100dvh-100px-56px)] w-full h-full"
        :palette="palette" @extract-colors-from-model="extractColorsFromModel"
      />
    </div>

    <div
      v-motion
      text="neutral-200/50 dark:neutral-600/20" pointer-events-none
      fixed top="[calc(100dvh-15rem)]" bottom-0 right--5 z--1
      :initial="{ scale: 0.9, opacity: 0, y: 15 }"
      :enter="{ scale: 1, opacity: 1, y: 0 }"
      :duration="500"
      size-60
      flex items-center justify-center
    >
      <div text="60" i-solar:people-nearby-bold-duotone />
    </div>
  </template>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.models.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.models.description
  icon: i-solar:people-nearby-bold-duotone
  settingsEntry: true
  order: 4
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
