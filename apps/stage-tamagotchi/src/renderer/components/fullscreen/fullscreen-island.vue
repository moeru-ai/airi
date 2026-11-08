<script setup lang="ts">
import type { FullscreenSurfaceId } from '../../../shared/eventa'

import { Dock, DockButton, DockSeparator, useTheme } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useFullscreenStore } from '../../stores/fullscreen'
import { fullscreenSurfaces } from './surfaces'

// The island of the fullscreen mode: a button for each registered surface and the theme switch. The way out of the
// mode is an island of its own below it, like the feed settings beside the floating chat dock. Only the icon of the
// shown surface takes the theme color.
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
  light: 'i-mingcute:sun-line',
  dark: 'i-mingcute:moon-line',
  auto: 'i-lucide:contrast',
})[themeMode.value])
const themeLabel = computed(() => t({
  light: `${KEY}.switch-to-dark-mode`,
  dark: `${KEY}.switch-to-system-mode`,
  auto: `${KEY}.switch-to-light-mode`,
}[themeMode.value]))
</script>

<template>
  <div :class="['flex flex-col items-center gap-2']">
    <Dock orientation="vertical" size="md" variant="blurry">
      <DockButton
        v-for="entry in surfaces"
        :key="entry.id"
        :icon="entry.icon"
        :label="t(entry.label)"
        :pressed="surface === entry.id"
        @click="show(entry.id)"
      />
      <DockSeparator />
      <DockButton :icon="themeIcon" :label="themeLabel" @click="switchToNextTheme" />
    </Dock>
    <Dock orientation="vertical" size="md" variant="blurry">
      <DockButton icon="i-mingcute:fullscreen-exit-line" :label="t(`${KEY}.exit`)" @click="fullscreen.close()" />
    </Dock>
  </div>
</template>
