<script setup lang="ts">
import type { BackgroundMaterialType, VibrancyType } from '@proj-airi/electron-eventa'

import { electron } from '@proj-airi/electron-eventa'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { FieldCombobox } from '@proj-airi/ui'
import { useAsyncState } from '@vueuse/core'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const getIsWindows = useElectronEventaInvoke(electron.app.isWindows)
const setVibrancy = useElectronEventaInvoke(electron.window.setVibrancy)
const setBackgroundMaterial = useElectronEventaInvoke(electron.window.setBackgroundMaterial)

const { state: isWindows } = useAsyncState(() => getIsWindows(), false)
const vibrancy = ref<NonNullable<VibrancyType>>()
const backgroundMaterial = ref<NonNullable<BackgroundMaterialType>>()

const { t } = useI18n()

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

function handleClose() {
  window.close()
}
</script>

<template>
  <div :class="['relative p-4']">
    <div class="drag-region" />
    <div :class="['absolute right-2 top-2 z-10 flex items-center gap-1', '[-webkit-app-region:no-drag]']">
      <button
        type="button"
        :class="[
          'size-8 flex items-center justify-center rounded-full text-white transition',
          'bg-black/40 hover:bg-black/60',
        ]"
        :title="t('tamagotchi.stage.inlay.close')"
        :aria-label="t('tamagotchi.stage.inlay.close')"
        @click="handleClose"
      >
        <span aria-hidden="true" :class="['text-2xl leading-none']">×</span>
      </button>
    </div>

    <div class="py-4">
      <h1>Spotlight</h1>
      <p>This is the Spotlight page.</p>
    </div>

    <div class="space-y-2">
      <FieldCombobox
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

      <FieldCombobox
        v-if="isWindows"
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
