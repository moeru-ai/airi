<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import { RouterView, useRouter } from 'vue-router'

import { useFullscreenCarry } from '../../composables/use-fullscreen-carry'
import { fullscreenSurfaceOf, fullscreenSurfaces } from './surfaces'

// The settings surface: the settings pages on the router of the window that hosts the mode, under its page. The panel
// keeps the last settings route while another surface shows or the mode closes, so the page stays mounted and keeps
// its state.
const router = useRouter()
const route = shallowRef(router.currentRoute.value)
watch(() => router.currentRoute.value, (current) => {
  if (fullscreenSurfaceOf(current.path) === 'settings')
    route.value = current
})

// Settings carry the page that shows when the mode moves to another window.
useFullscreenCarry<string>('settings', {
  collect: () => fullscreenSurfaceOf(route.value.path) === 'settings' ? route.value.fullPath : undefined,
  restore: page => fullscreenSurfaces.settings.prepare?.({ router, page }),
})
</script>

<template>
  <RouterView v-if="fullscreenSurfaceOf(route.path) === 'settings'" :route="route" />
</template>
