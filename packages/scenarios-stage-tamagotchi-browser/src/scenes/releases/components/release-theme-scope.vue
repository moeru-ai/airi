<script setup lang="ts">
import type { ReleaseTheme } from './release-theme'

import { provide } from 'vue'

import { releaseThemeKey } from './release-theme'

/**
 * Renders its areas in one theme. The `dark` class turns on the `dark:` utilities of UnoCSS inside it.
 */
const props = defineProps<{
  theme: ReleaseTheme
}>()

provide(releaseThemeKey, props.theme)
</script>

<template>
  <div :class="['flex flex-col items-start gap-10', props.theme === 'dark' ? 'dark' : '']">
    <slot />
  </div>
</template>
