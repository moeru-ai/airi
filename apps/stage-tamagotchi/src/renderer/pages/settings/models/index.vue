<script setup lang="ts">
import { ModelSettingsPanel } from '@proj-airi/stage-ui/components/scenarios/settings/model-settings'
import { ref } from 'vue'

import { useModelSettingsRuntimeSnapshot } from '../../../composables/model-settings-runtime-snapshot'

const palette = ref<string[]>([])
const { runtimeSnapshot } = useModelSettingsRuntimeSnapshot()
</script>

<template>
  <div :class="['relative', 'h-full', 'flex', 'justify-center']">
    <ModelSettingsPanel
      :allow-extract-colors="false"
      :palette="palette"
      :runtime-snapshot="runtimeSnapshot"
      :settings-class="[
        'w-full',
        'max-w-6xl',
        'h-fit',
        'sm:max-h-[80dvh]',
        'overflow-y-scroll',
        'relative',
      ]"
    />
  </div>

  <div
    v-motion
    :class="[
      'fixed',
      'right--5 top-[calc(100dvh-15rem)] bottom-0 z--1',
      'pointer-events-none flex size-60 items-center justify-center',
      'text-neutral-200/50 dark:text-neutral-600/20',
    ]"
    :initial="{ scale: 0.9, opacity: 0, y: 15 }"
    :enter="{ scale: 1, opacity: 1, y: 0 }"
    :duration="500"
  >
    <div class="i-solar:people-nearby-bold-duotone text-60" />
  </div>
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
