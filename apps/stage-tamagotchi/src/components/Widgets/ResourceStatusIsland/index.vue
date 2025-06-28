<script setup lang="ts">
import { TransitionVertical } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'
import { ref } from 'vue'

import { useResourcesStore } from '../../../stores/resources'
import LoadingProgress from './LoadingProgress.vue'

const { resources } = storeToRefs(useResourcesStore())

const loadingProgressOpen = ref(false)

function handleClick() {
  loadingProgressOpen.value = !loadingProgressOpen.value
}
</script>

<template>
  <div fixed left-0 top-3 w-full flex flex-col items-center>
    <TooltipProvider :delay-duration="150">
      <TooltipRoot :open="loadingProgressOpen" disable-closing-trigger @update:open="(state) => loadingProgressOpen = state">
        <TooltipTrigger>
          <div
            w="fit"
            bg="white/80 dark:neutral-900/80"
            mb-1 flex cursor-pointer items-center gap-2 rounded-full px-2 py-1 text-sm shadow-md backdrop-blur-md
            @click="handleClick"
          >
            <div i-svg-spinners:pulse-ring pointer-events-none />
            <div pointer-events-none select-none pr-2>
              Downloading...
            </div>
          </div>
        </TooltipTrigger>
        <TooltipPortal>
          <TransitionVertical>
            <TooltipContent class="resource-status-island-tooltip">
              <LoadingProgress
                w="[calc(100%-1.5rem)]" max-w="500px sm:600px md:700px"
                bg="white/80 dark:neutral-900/80"
                mx-3 rounded-xl p-3 shadow-md backdrop-blur-md will-change-transform
                :progress-info="resources"
              />
            </TooltipContent>
          </TransitionVertical>
        </TooltipPortal>
      </TooltipRoot>
    </TooltipProvider>
  </div>
</template>

<style>
[data-reka-popper-content-wrapper=""]:has(.resource-status-island-tooltip) {
  z-index: 1000 !important;
}
</style>
