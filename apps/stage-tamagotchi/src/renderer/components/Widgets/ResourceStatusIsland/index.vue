<script setup lang="ts">
import { TransitionVertical } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'
import { ref, watch } from 'vue'

import LoadingModules from './LoadingModules.vue'

import { useResourcesStore } from '../../../stores/resources'
import { useWindowStore } from '../../../stores/window'

const { shouldHideView } = storeToRefs(useWindowStore())
const { atLeastOneLoading, atLeastOneLoadingDelay5s, atLeastOneLoadingDelay10s } = storeToRefs(useResourcesStore())

const loadingProgressOpen = ref(false)

watch(atLeastOneLoading, (newVal) => {
  loadingProgressOpen.value = newVal
}, { immediate: true })

function handleClick() {
  loadingProgressOpen.value = !loadingProgressOpen.value
}
</script>

<template>
  <div fixed left-0 top-3 w-full flex flex-col items-center>
    <TooltipProvider v-if="atLeastOneLoadingDelay10s" :delay-duration="150">
      <TooltipRoot :open="loadingProgressOpen && !shouldHideView" disable-closing-trigger @update:open="(state) => loadingProgressOpen = state">
        <TooltipTrigger>
          <Transition name="fade">
            <div
              v-if="atLeastOneLoadingDelay5s"
              w="fit"
              bg="white/80 dark:neutral-900/80"
              mb-1 flex cursor-pointer items-center gap-2 rounded-full px-2 py-1 text-sm shadow-md backdrop-blur-md
              @click="handleClick"
            >
              <div v-if="atLeastOneLoading" i-svg-spinners:pulse-ring pointer-events-none />
              <div v-else i-solar:check-circle-bold-duotone pointer-events-none text="green-600 dark:green-400" />
              <div v-if="atLeastOneLoading" pointer-events-none select-none pr-2>
                Resources loading...
              </div>
              <div v-else pointer-events-none select-none pr-2>
                Ready!
              </div>
            </div>
          </Transition>
        </TooltipTrigger>
        <TooltipPortal>
          <TransitionVertical>
            <TooltipContent class="resource-status-island-tooltip" w-fit flex justify-center>
              <LoadingModules
                w="[calc(100dvw-1.5rem)] sm:[calc(75dvw-1.5rem)] md:sm:[calc(50dvw-1.5rem)]"
                bg="white/80 dark:neutral-900/80"
                rounded-xl p-3 shadow-md backdrop-blur-md will-change-transform
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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease-in-out;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-enter-to,
.fade-leave-from {
  opacity: 1;
}
</style>
