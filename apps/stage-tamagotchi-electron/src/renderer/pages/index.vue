<script setup lang="ts">
import { WidgetStage } from '@proj-airi/stage-ui/components/scenes'
import { useLive2d } from '@proj-airi/stage-ui/stores/live2d'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import ResourceStatusIsland from '../components/Widgets/ResourceStatusIsland/index.vue'

import { useWindowStore } from '../stores/window'
import { useWindowControlStore } from '../stores/window-controls'
import { WindowControlMode } from '../types/window-controls'

export interface Point {
  x: number
  y: number
}

const windowControlStore = useWindowControlStore()
const { scale, positionInPercentageString } = storeToRefs(useLive2d())

const { centerPos, live2dLookAtX, live2dLookAtY } = storeToRefs(useWindowStore())
const live2dFocusAt = ref<Point>(centerPos.value)
const widgetStageRef = ref<{ canvasElement: () => HTMLCanvasElement }>()
const resourceStatusIslandRef = ref<InstanceType<typeof ResourceStatusIsland>>()

const isClickThrough = ref(false)
const isFirstTime = ref(true)
const isLoading = ref(true)
const componentStateStage = ref<'pending' | 'loading' | 'mounted'>('pending')

watch(componentStateStage, () => isLoading.value = componentStateStage.value !== 'mounted', { immediate: true })
watch([live2dLookAtX, live2dLookAtY], ([x, y]) => live2dFocusAt.value = { x, y }, { immediate: true })

const modeIndicatorClass = computed(() => {
  switch (windowControlStore.controlMode) {
    case WindowControlMode.MOVE:
      return 'cursor-move'
    case WindowControlMode.RESIZE:
      return 'cursor-se-resize'
    case WindowControlMode.DEBUG:
      return 'debug-mode'
    default:
      return ''
  }
})
</script>

<template>
  <div
    :class="[modeIndicatorClass, {
      'op-0': windowControlStore.isIgnoringMouseEvent && !isClickThrough && !isFirstTime,
    }]"
    max-h="[100vh]"
    max-w="[100vw]"
    flex="~ col"
    relative z-2 h-full overflow-hidden rounded-xl
    transition="opacity duration-500 ease-in-out"
  >
    <div v-show="!isLoading" relative h-full w-full items-end gap-2 class="view">
      <WidgetStage
        ref="widgetStageRef"
        v-model:state="componentStateStage"
        h-full w-full
        flex-1
        :focus-at="live2dFocusAt"
        :scale="scale"
        :x-offset="positionInPercentageString.x"
        :y-offset="positionInPercentageString.y"
        mb="<md:18"
      />
      <ResourceStatusIsland ref="resourceStatusIslandRef" />
    </div>
    <div v-show="isLoading" h-full w-full>
      <div class="absolute left-0 top-0 z-99 h-full w-full flex cursor-grab items-center justify-center overflow-hidden">
        <div
          class="absolute h-24 w-full flex items-center justify-center overflow-hidden rounded-xl"
          bg="white/80 dark:neutral-950/80" backdrop-blur="md"
        >
          <div class="drag-region absolute left-0 top-0 h-full w-full flex animate-flash animate-duration-5s animate-count-infinite select-none items-center justify-center text-1.5rem text-primary-400 font-normal">
            Loading...
          </div>
        </div>
      </div>
    </div>
  </div>
  <Transition
    enter-active-class="transition-opacity duration-250"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-250"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="windowControlStore.controlMode === WindowControlMode.MOVE"
      class="drag-region absolute left-0 top-0 z-99 h-full w-full flex cursor-grab items-center justify-center overflow-hidden"
    >
      <div
        class="absolute h-32 w-full flex items-center justify-center overflow-hidden rounded-xl"
        bg="white/80 dark:neutral-950/80" backdrop-blur="md"
      >
        <div class="wall absolute top-0 h-8" />
        <div class="drag-region absolute left-0 top-0 h-full w-full flex animate-flash animate-duration-5s animate-count-infinite select-none items-center justify-center text-1.5rem text-primary-400 font-normal">
          DRAG HERE TO MOVE
        </div>
        <div class="wall drag-region absolute bottom-0 h-8" />
      </div>
    </div>
  </Transition>
  <Transition
    enter-active-class="transition-opacity duration-250 ease-in-out"
    enter-from-class="opacity-50"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-250 ease-in-out"
    leave-from-class="opacity-100"
    leave-to-class="opacity-50"
  >
    <div
      v-if="windowControlStore.controlMode === WindowControlMode.RESIZE"
      class="absolute left-0 top-0 z-999 h-full w-full"
    >
      <div h-full w-full animate-flash animate-duration-2.5s animate-count-infinite b-4 b-primary rounded-2xl />
    </div>
  </Transition>
</template>

<style scoped>
.drag-region {
  app-region: drag;
}

.view {
  transition: opacity 0.5s ease-in-out;

  .show-on-hover {
    opacity: 1;
  }
}

@keyframes wall-move {
  0% {
    transform: translateX(calc(var(--wall-width) * -2));
  }
  100% {
    transform: translateX(calc(var(--wall-width) * 1));
  }
}

.wall {
  --at-apply: text-primary-300;

  --wall-width: 8px;
  animation: wall-move 1s linear infinite;
  background-image: repeating-linear-gradient(
    45deg,
    currentColor,
    currentColor var(--wall-width),
    #ff00 var(--wall-width),
    #ff00 calc(var(--wall-width) * 2)
  );
  width: calc(100% + 4 * var(--wall-width));
}
</style>

<route lang="yaml">
meta:
  layout: stage
</route>
