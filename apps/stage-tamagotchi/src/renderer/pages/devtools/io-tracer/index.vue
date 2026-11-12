<script setup lang="ts">
import { IOTracerDevtools } from '@proj-airi/stage-ui/features/trace/io-tracer'
import { computed, inject, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import WindowControls from '../../../components/Window/window-controls.vue'

import { fullscreenPanelKey } from '../../../components/fullscreen/panel'
import { useWindowControls } from '../../../composables/use-window-controls'

const { t } = useI18n()
const router = useRouter()
const { reservesSystemControls, centerSystemControls } = useWindowControls()
// The fullscreen panel of the main window frames this page itself, so the page leaves out the window buttons.
const inFullscreenPanel = inject(fullscreenPanelKey, false)

// The devtools window has no title bar, so the tab bars at the top of the workbench act as one.
const frame = computed(() => inFullscreenPanel
  ? undefined
  : { insetStart: reservesSystemControls.value ? '4.75rem' : undefined, draggable: true })

// The traffic lights sit in the top tab bar, and its center is lower than in a 44px title bar.
// It is the 6px padding of the workbench and half of the 40px tab bar.
const TAB_BAR_CENTER_Y = 26

onMounted(() => {
  if (!inFullscreenPanel)
    void centerSystemControls({ centerY: TAB_BAR_CENTER_Y })
})
onUnmounted(() => {
  if (!inFullscreenPanel)
    void centerSystemControls({})
})
</script>

<template>
  <IOTracerDevtools :frame="frame">
    <template #leading>
      <button
        type="button"
        :title="t('tamagotchi.settings.devtools.pages.io-tracer.actions.back')"
        :aria-label="t('tamagotchi.settings.devtools.pages.io-tracer.actions.back')"
        :class="[
          'flex size-7 shrink-0 items-center justify-center rounded-md',
          'text-neutral-500 hover:bg-neutral-200/70 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100',
        ]"
        @click="router.back()"
      >
        <span :class="['i-mingcute:arrow-left-line size-4']" />
      </button>
    </template>
    <template #frame-end>
      <WindowControls v-if="!inFullscreenPanel" />
    </template>
  </IOTracerDevtools>
</template>

<route lang="yaml">
meta:
  layout: plain
  titleKey: tamagotchi.settings.devtools.pages.io-tracer.title
  subtitleKey: tamagotchi.settings.devtools.title
</route>
