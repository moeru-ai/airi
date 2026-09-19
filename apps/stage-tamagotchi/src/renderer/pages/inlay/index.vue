<script setup lang="ts">
import type { BackgroundMaterialType, VibrancyType } from '@proj-airi/electron-eventa'

import { electron } from '@proj-airi/electron-eventa'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { FieldCombobox, GhostButton } from '@proj-airi/ui'
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
  <div class="p-4">
    <div class="drag-region" />

    <div :class="['flex items-start justify-between gap-4', 'py-4']">
      <div class="min-w-0">
        <h1>Spotlight</h1>
        <p>This is the Spotlight page.</p>
      </div>
      <GhostButton
        size="unset"
        type="button"
        :class="['size-8 shrink-0', '[-webkit-app-region:no-drag]']"
        :title="t('tamagotchi.stage.inlay.close')"
        :aria-label="t('tamagotchi.stage.inlay.close')"
        @click="handleClose"
      >
        <span aria-hidden="true" :class="['i-solar:close-circle-linear size-5']" />
      </GhostButton>
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
