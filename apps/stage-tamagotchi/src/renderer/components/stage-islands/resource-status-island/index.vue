<script setup lang="ts">
import { ModelAssetProgress } from '@proj-airi/stage-ui/components'
import { useModelAssetStatus } from '@proj-airi/stage-ui/composables'
import { ensureSherpawModelAssets } from '@proj-airi/stage-ui/libs/providers/providers/sherpaw/model-assets'
import { TransitionVertical } from '@proj-airi/ui'
import { TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { stageOpaqueAttribute } from '../../../composables/use-stage-painted-mask'

// The island shows only model downloads that run or failed. It hides when the last one installs.
const { active: modelAssets } = useModelAssetStatus()
const { t } = useI18n()
const hasActiveResources = computed(() => modelAssets.value.length > 0)
const hasAssetError = computed(() => modelAssets.value.some(model => model.state === 'error'))

const loadingProgressOpen = shallowRef(false)

watch(hasActiveResources, (newVal) => {
  loadingProgressOpen.value = newVal
}, { immediate: true })

function handleClick() {
  loadingProgressOpen.value = !loadingProgressOpen.value
}

function retry(id: string) {
  // The repository publishes progress and any new failure as status, and this row shows it.
  // The rejection carries nothing more, so it is not shown twice.
  ensureSherpawModelAssets(id).catch(() => {})
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
    <TooltipProvider v-if="hasActiveResources" :delay-duration="150">
      <TooltipRoot :open="loadingProgressOpen" disable-closing-trigger @update:open="(state) => loadingProgressOpen = state">
        <TooltipTrigger>
          <Transition name="fade">
            <div
              v-if="hasActiveResources"
              :[stageOpaqueAttribute]="true"
              :class="[
                'pointer-events-auto mb-1 flex w-fit cursor-pointer items-center gap-2',
                'rounded-full px-2 py-1 text-sm shadow-md backdrop-blur-md',
                'bg-white/80 dark:bg-neutral-900/80',
              ]"
              @click="handleClick"
            >
              <div v-if="hasAssetError" :class="['i-solar:danger-triangle-bold-duotone pointer-events-none', 'text-orange-600 dark:text-orange-400']" />
              <div v-else :class="['i-svg-spinners:pulse-ring pointer-events-none']" />
              <div :class="['pointer-events-none select-none pr-2']">
                {{ hasAssetError ? t('tamagotchi.stage.resource-island.failed') : t('tamagotchi.stage.resource-island.loading') }}
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
                <ModelAssetProgress :statuses="modelAssets" @retry="retry" />
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
