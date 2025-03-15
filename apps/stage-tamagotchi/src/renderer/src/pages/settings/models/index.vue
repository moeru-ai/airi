<script setup lang="ts">
import { WidgetStage } from '@proj-airi/stage-ui/components'
import { useRouter } from 'vue-router'

import Live2DSettings from '../../../components/Widgets/Live2DSettings.vue'

const router = useRouter()
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
    <WidgetStage w="50%" h="80vh" />
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
