<script setup lang="ts">
import { TransitionVertical } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'
import { shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import LoadingModules from './loading-modules.vue'

import { useResourcesStore } from '../../../stores/resources'

const {
  atLeastOneLoading,
  atLeastOneLoadingDelay5s,
  atLeastOneLoadingDelay10s,
} = storeToRefs(useResourcesStore())
const { t } = useI18n()

const loadingProgressOpen = shallowRef(false)

watch(atLeastOneLoading, (newVal) => {
  loadingProgressOpen.value = newVal
}, { immediate: true })

function handleClick() {
  loadingProgressOpen.value = !loadingProgressOpen.value
}
</script>

<template>
  <!--
    The container spans the whole stage width while only its pill is interactive. The
    stage window asks the document what sits under the cursor before it passes a click
    to the application behind, so a container that answers would take the strip beside
    the pill with it.
  -->
  <div :class="['pointer-events-none fixed left-0 top-3 w-full', 'flex flex-col items-center']">
    <TooltipProvider v-if="atLeastOneLoadingDelay10s" :delay-duration="150">
      <TooltipRoot :open="loadingProgressOpen" disable-closing-trigger @update:open="(state) => loadingProgressOpen = state">
        <TooltipTrigger>
          <Transition name="fade">
            <div
              v-if="atLeastOneLoadingDelay5s"
              :class="[
                'pointer-events-auto mb-1 flex w-fit cursor-pointer items-center gap-2',
                'rounded-full px-2 py-1 text-sm shadow-md backdrop-blur-md',
                'bg-white/80 dark:bg-neutral-900/80',
              ]"
              @click="handleClick"
            >
              <div v-if="atLeastOneLoading" :class="['i-svg-spinners:pulse-ring pointer-events-none']" />
              <div v-else :class="['i-solar:check-circle-bold-duotone pointer-events-none', 'text-green-600 dark:text-green-400']" />
              <div v-if="atLeastOneLoading" :class="['pointer-events-none select-none pr-2']">
                {{ t('tamagotchi.stage.resource-island.loading') }}
              </div>
              <div v-else :class="['pointer-events-none select-none pr-2']">
                {{ t('tamagotchi.stage.resource-island.ready') }}
              </div>
            </div>
          </Transition>
        </TooltipTrigger>
        <TooltipPortal>
          <TransitionVertical>
            <TooltipContent :class="['resource-status-island-tooltip', 'flex w-fit justify-center']">
              <div
                :class="[
                  'w-[calc(100dvw-1.5rem)] sm:w-[calc(75dvw-1.5rem)] md:sm:w-[calc(50dvw-1.5rem)]',
                  'rounded-xl p-3 shadow-md backdrop-blur-md',
                  'bg-white/80 dark:bg-neutral-900/80',
                ]"
              >
                <LoadingModules v-if="atLeastOneLoading" />
              </div>
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
