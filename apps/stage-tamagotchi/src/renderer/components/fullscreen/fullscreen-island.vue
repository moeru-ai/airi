<script setup lang="ts">
import type { FullscreenSurfaceId } from '../../../shared/eventa'

import { useTheme } from '@proj-airi/ui'
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
  light: 'i-solar:sun-2-bold-duotone',
  dark: 'i-solar:moon-bold-duotone',
  auto: 'i-lucide:contrast',
})[themeMode.value])
const themeLabel = computed(() => t({
  light: `${KEY}.switch-to-dark-mode`,
  dark: `${KEY}.switch-to-system-mode`,
  auto: `${KEY}.switch-to-light-mode`,
}[themeMode.value]))

/** The classes of an island button. A hover shows the round background and keeps the icon color. */
function buttonClass(pressed = false) {
  return [
    'size-9 flex shrink-0 items-center justify-center rounded-full outline-none',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300',
    'transition-colors transition-transform active:scale-95',
    'hover:bg-neutral-200 dark:hover:bg-neutral-800',
    pressed ? 'text-primary-500 dark:text-primary-400' : 'text-neutral-400 dark:text-neutral-500',
  ]
}

const separatorClass = ['my-0.5 h-px w-4 shrink-0', 'bg-neutral-200 dark:bg-neutral-700']

const pillClass = ['rounded-full p-0.5', 'bg-white shadow-md dark:bg-neutral-900']
</script>

<template>
  <div :class="['flex flex-col items-center gap-2']">
    <div :class="['flex flex-col items-center gap-1', pillClass]">
      <button
        v-for="entry in surfaces"
        :key="entry.id"
        type="button"
        :class="buttonClass(surface === entry.id)"
        :aria-pressed="surface === entry.id"
        :aria-label="t(entry.label)"
        :title="t(entry.label)"
        @click="show(entry.id)"
      >
        <span :class="[entry.icon, 'size-5']" />
      </button>
      <div :class="separatorClass" />
      <button
        type="button"
        :class="buttonClass()"
        :aria-label="themeLabel"
        :title="themeLabel"
        @click="switchToNextTheme"
      >
        <span :class="[themeIcon, 'size-5']" />
      </button>
    </div>
    <div :class="pillClass">
      <button
        type="button"
        :class="buttonClass()"
        :aria-label="t(`${KEY}.exit`)"
        :title="t(`${KEY}.exit`)"
        @click="fullscreen.close()"
      >
        <span :class="['i-solar:quit-full-screen-square-bold', 'size-5']" />
      </button>
    </div>
  </div>
</template>
