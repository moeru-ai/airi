<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import WindowTitleBar from './TitleBar.vue'

const props = defineProps<{
  /** False in a window that hosts the fullscreen mode, because the mode frames settings pages itself. */
  enabled: boolean
}>()

const { t } = useI18n()
const route = useRoute()

// NOTICE:
// The settings pages render in the shared `settings` layout of `packages/stage-layouts`, not in `layouts/settings.vue`
// of this app. `vite-plugin-vue-layouts` lets the last directory in `layoutsDirs` win, and `electron.vite.config.ts`
// lists the shared directory last. The shared layout also serves stage-web, so the desktop title bar stays here.
// Removal condition: this app owns its settings layout.
const framed = computed(() => props.enabled && route.meta.layout === 'settings')
</script>

<template>
  <WindowTitleBar v-if="framed" :title="t('settings.title')" icon="i-solar:settings-bold" />
  <div :class="framed ? 'h-full pt-11' : 'contents'">
    <slot />
  </div>
</template>
