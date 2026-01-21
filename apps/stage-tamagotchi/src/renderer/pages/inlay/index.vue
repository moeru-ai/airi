<script setup lang="ts">
import type { BackgroundMaterialType, VibrancyType } from '../../../shared/electron/window'

import { FieldSelect } from '@proj-airi/ui'
import { ref, watch } from 'vue'

import { electron } from '../../../shared/electron'
import { useElectronEventaInvoke } from '../../composables/electron-vueuse'

const setVibrancy = useElectronEventaInvoke(electron.window.setVibrancy)
const setBackgroundMaterial = useElectronEventaInvoke(electron.window.setBackgroundMaterial)

const vibrancy = ref<NonNullable<VibrancyType>>()
const backgroundMaterial = ref<NonNullable<BackgroundMaterialType>>()

watch(
  vibrancy,
  (newVibrancy) => {
    setVibrancy([newVibrancy ?? null])
  },
)

watch(
  backgroundMaterial,
  (newBackgroundMaterial) => {
    if (!newBackgroundMaterial)
      return

    setBackgroundMaterial([newBackgroundMaterial])
  },
)
</script>

<template>
  <div class="p-4">
    <div class="drag-region" />

    <div class="py-4">
      <h1>Spotlight</h1>
      <p>This is the Spotlight page.</p>
    </div>

    <div class="space-y-2">
      <FieldSelect
        v-model="vibrancy"
        label="Vibrancy"
        description="Set the vibrancy effect of the window."
        :options="[
          { label: 'titlebar', value: 'titlebar' },
          { label: 'selection', value: 'selection' },
          { label: 'menu', value: 'menu' },
          { label: 'popover', value: 'popover' },
          { label: 'sidebar', value: 'sidebar' },
          { label: 'header', value: 'header' },
          { label: 'sheet', value: 'sheet' },
          { label: 'window', value: 'window' },
          { label: 'hud', value: 'hud' },
          { label: 'fullscreen-ui', value: 'fullscreen-ui' },
          { label: 'tooltip', value: 'tooltip' },
          { label: 'content', value: 'content' },
          { label: 'under-window', value: 'under-window' },
          { label: 'under-page', value: 'under-page' },
        ]"
      />

      <FieldSelect
        v-model="backgroundMaterial"
        label="Background Material"
        description="Set the background material of the window."
        :options="[
          { label: 'auto', value: 'auto' },
          { label: 'none', value: 'none' },
          { label: 'mica', value: 'mica' },
          { label: 'acrylic', value: 'acrylic' },
          { label: 'tabbed', value: 'tabbed' },
        ]"
      />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
