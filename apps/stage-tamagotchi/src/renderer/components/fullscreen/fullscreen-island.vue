<script setup lang="ts">
import type { FullscreenSurfaceId } from '../../../shared/eventa'

import { GhostButton, useTheme } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useFullscreenStore } from '../../stores/fullscreen'
import { fullscreenSurfaces } from './surfaces'

// The island of the fullscreen mode: one button for each registered surface, the theme switch, and the way out of
// the mode.
const { t } = useI18n()
const fullscreen = useFullscreenStore()
const { surface } = storeToRefs(fullscreen)

const KEY = 'tamagotchi.stage.fullscreen-island'

const surfaces = Object.entries(fullscreenSurfaces).map(([id, definition]) => ({ id: id as FullscreenSurfaceId, ...definition }))

function show(id: FullscreenSurfaceId) {
  void fullscreen.open(id).catch(error => console.error('[Fullscreen island] Failed to show the surface:', error))
}

// The theme cycles light, dark, then the system theme, like the Controls Island. Each button names the next theme.
const { themeMode, switchToNextTheme } = useTheme()
const themeIcon = computed(() => ({
  light: 'i-solar:sun-2-outline',
  dark: 'i-solar:moon-outline',
  auto: 'i-lucide:contrast',
})[themeMode.value])
const themeLabel = computed(() => t({
  light: `${KEY}.switch-to-dark-mode`,
  dark: `${KEY}.switch-to-system-mode`,
  auto: `${KEY}.switch-to-light-mode`,
}[themeMode.value]))
</script>

<template>
  <div
    :class="[
      'flex flex-col items-center',
      'gap-1',
      'rounded-2xl p-1.5',
      'bg-neutral-200 dark:bg-neutral-800',
    ]"
  >
    <GhostButton
      v-for="entry in surfaces"
      :key="entry.id"
      size="unset"
      :class="['size-11']"
      :active="surface === entry.id"
      :aria-pressed="surface === entry.id"
      :aria-label="t(entry.label)"
      :title="t(entry.label)"
      @click="show(entry.id)"
    >
      <span :class="[entry.icon, 'size-5']" />
    </GhostButton>
    <div :class="['my-1 h-px w-6', 'bg-neutral-200 dark:bg-neutral-700']" />
    <GhostButton
      size="unset"
      :class="['size-11']"
      :aria-label="themeLabel"
      :title="themeLabel"
      @click="switchToNextTheme"
    >
      <span :class="[themeIcon, 'size-5']" />
    </GhostButton>
    <div :class="['my-1 h-px w-6', 'bg-neutral-200 dark:bg-neutral-700']" />
    <GhostButton
      size="unset"
      :class="['size-11']"
      :aria-label="t(`${KEY}.exit`)"
      :title="t(`${KEY}.exit`)"
      @click="fullscreen.close()"
    >
      <span :class="['i-solar:quit-full-screen-square-linear', 'size-5']" />
    </GhostButton>
  </div>
</template>
