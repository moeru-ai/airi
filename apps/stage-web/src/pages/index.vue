<script setup lang="ts">
import { WidgetStage } from '@proj-airi/stage-ui/components'
import { useDark } from '@vueuse/core'
import { ref } from 'vue'

import Cross from '../components/Backgrounds/Cross.vue'
import AnimatedBackground from '../components/Layouts/AnimatedBackground.vue'
import Header from '../components/Layouts/Header.vue'
import InteractiveArea from '../components/Layouts/InteractiveArea.vue'
import MobileHeader from '../components/Layouts/MobileHeader.vue'
import MobileInteractiveArea from '../components/Layouts/MobileInteractiveArea.vue'

const dark = useDark()
const paused = ref(false)

function handleSettingsOpen(open: boolean) {
  paused.value = open
}
</script>

<template>
  <Cross>
    <AnimatedBackground :fill-color="dark ? 'oklch(29% var(--theme-colors-chroma) var(--theme-colors-hue))' : 'color-mix(in srgb, oklch(95% var(--theme-colors-chroma-50) var(--theme-colors-hue)) 80%, oklch(100% 0 360))'">
      <div relative flex="~ col" z-2 h-100vh w-100vw of-hidden>
        <!-- header -->
        <div>
          <Header class="flex <md:hidden" p2 />
          <MobileHeader class="hidden <md:block" />
        </div>
        <!-- page -->
        <div relative flex="~ 1 row gap-y-0 gap-x-2 <md:col">
          <WidgetStage flex-1 min-w="1/2" :paused="paused" />
          <InteractiveArea class="flex <md:hidden" flex-1 max-w="500px" min-w="30%" />
          <MobileInteractiveArea class="hidden <md:block" mx2 mb2 @settings-open="handleSettingsOpen" />
        </div>
      </div>
    </AnimatedBackground>
  </Cross>
</template>

<route lang="yaml">
meta:
  layout: stage
  stageTransition:
    name: bubble-wave-out
</route>
