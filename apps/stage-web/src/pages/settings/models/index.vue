<script setup lang="ts">
import Live2DCanvas from '@proj-airi/stage-ui/components/Live2D/Canvas.vue'
import Live2DModel from '@proj-airi/stage-ui/components/Live2D/Model.vue'
import { useElementBounding } from '@vueuse/core'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import Live2DSettings from '../../../components/Widgets/Live2DSettings.vue'

const router = useRouter()
const live2dContainerRef = ref<HTMLDivElement>()
const { width, height } = useElementBounding(live2dContainerRef)
</script>

<template>
  <div flex="~ row" items-center gap-2>
    <button @click="router.back()">
      <div i-solar:alt-arrow-left-line-duotone text-2xl />
    </button>
    <h1 relative>
      <div absolute left-0 top-0 translate-y="[-80%]">
        <span text="neutral-300 dark:neutral-500">Settings</span>
      </div>
      <div text-3xl font-semibold>
        Models
      </div>
    </h1>
  </div>
  <div flex>
    <div ref="live2dContainerRef" w="50%" h="80vh">
      <Live2DCanvas v-slot="{ app }" :width="width" :height="height">
        <Live2DModel :app="app" :mouth-open-size="0" :width="width" :height="height" :paused="false" />
      </Live2DCanvas>
    </div>
    <Live2DSettings w="50%" h="80vh" />
  </div>

  <div text="neutral-100/50 dark:neutral-500/20" pointer-events-none fixed bottom-0 right-0 translate-x-10 translate-y-10>
    <div text="40" i-lucide:person-standing />
  </div>
</template>

<route lang="yaml">
meta:
  stageTransition:
    name: slide
</route>
