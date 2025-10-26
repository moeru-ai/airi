<script setup lang="ts">
import { WidgetStage } from '@proj-airi/stage-ui/components/scenes'
import { useCanvasPixelIsTransparentAtPoint } from '@proj-airi/stage-ui/composables/canvas-alpha'
import { useLive2d } from '@proj-airi/stage-ui/stores/live2d'
import { debouncedRef, watchPausable } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { ref, toRef, watch } from 'vue'

import ControlsIsland from '../components/Widgets/ControlsIsland/index.vue'
import ResourceStatusIsland from '../components/Widgets/ResourceStatusIsland/index.vue'

import { electron } from '../../shared/electron'
import {
  useElectronEventaInvoke,
  useElectronMouseAroundWindowBorder,
  useElectronMouseInElement,
  useElectronMouseInWindow,
  useElectronRelativeMouse,
} from '../composables/electron-vueuse'
import { useWindowStore } from '../stores/window'

const resourceStatusIslandRef = ref<InstanceType<typeof ResourceStatusIsland>>()
const controlsIslandRef = ref<InstanceType<typeof ControlsIsland>>()
const widgetStageRef = ref<{ canvasElement: () => HTMLCanvasElement }>()
const stageCanvas = toRef(() => widgetStageRef.value?.canvasElement())
const componentStateStage = ref<'pending' | 'loading' | 'mounted'>('pending')

const isLoading = ref(true)

const isIgnoringMouseEvents = ref(false)
const shouldFadeOnCursorWithin = ref(false)

const { isOutside: isOutsideWindow } = useElectronMouseInWindow()
const { isOutside } = useElectronMouseInElement(controlsIslandRef)
const isOutsideFor250Ms = debouncedRef(isOutside, 250)
const { x: relativeMouseX, y: relativeMouseY } = useElectronRelativeMouse()
const isTransparent = useCanvasPixelIsTransparentAtPoint(stageCanvas, relativeMouseX, relativeMouseY)
const { isNearAnyBorder: isAroundWindowBorder } = useElectronMouseAroundWindowBorder({ threshold: 30 })
const isAroundWindowBorderFor250Ms = debouncedRef(isAroundWindowBorder, 250)

const setIgnoreMouseEvents = useElectronEventaInvoke(electron.window.setIgnoreMouseEvents)

const { scale, positionInPercentageString } = storeToRefs(useLive2d())
const { live2dLookAtX, live2dLookAtY } = storeToRefs(useWindowStore())

watch(componentStateStage, () => isLoading.value = componentStateStage.value !== 'mounted', { immediate: true })

const { pause, resume } = watchPausable(isTransparent, (transparent) => {
  shouldFadeOnCursorWithin.value = !transparent
}, { immediate: true })

watch([isOutsideFor250Ms, isAroundWindowBorderFor250Ms, isOutsideWindow, isTransparent], () => {
  const insideControls = !isOutsideFor250Ms.value
  const nearBorder = isAroundWindowBorderFor250Ms.value

  if (insideControls || nearBorder) {
    // Inside interactive controls or near resize border: do NOT ignore events
    isIgnoringMouseEvents.value = false
    shouldFadeOnCursorWithin.value = false
    setIgnoreMouseEvents([false, { forward: true }])
    pause()
  }
  else {
    // Otherwise allow click-through while we fade UI based on transparency
    isIgnoringMouseEvents.value = true
    if (!isOutsideWindow.value && !isTransparent.value) {
      shouldFadeOnCursorWithin.value = true
    }
    setIgnoreMouseEvents([true, { forward: true }])
    resume()
  }
})
</script>

<template>
  <div
    max-h="[100vh]"
    max-w="[100vw]"
    flex="~ col"
    relative z-2 h-full overflow-hidden rounded-xl
    transition="opacity duration-500 ease-in-out"
  >
    <div
      v-show="!isLoading"
      :class="[
        'relative h-full w-full items-end gap-2',
        'transition-opacity duration-250 ease-in-out',
      ]"
    >
      <div
        :class="[
          shouldFadeOnCursorWithin ? 'op-0' : 'op-100',
          'absolute',
          'top-0 left-0 w-full h-full',
          'overflow-hidden',
          'rounded-2xl',
          'transition-opacity duration-250 ease-in-out',
        ]"
      >
        <ResourceStatusIsland ref="resourceStatusIslandRef" />
        <WidgetStage
          ref="widgetStageRef"
          v-model:state="componentStateStage"
          h-full w-full
          flex-1
          :focus-at="{ x: live2dLookAtX, y: live2dLookAtY }"
          :scale="scale"
          :x-offset="positionInPercentageString.x"
          :y-offset="positionInPercentageString.y"
          mb="<md:18"
        />
        <ControlsIsland ref="controlsIslandRef" />
      </div>
    </div>
    <div v-show="isLoading" h-full w-full>
      <div class="absolute left-0 top-0 z-99 h-full w-full flex cursor-grab items-center justify-center overflow-hidden">
        <div
          :class="[
            'absolute h-24 w-full overflow-hidden rounded-xl',
            'flex items-center justify-center',
            'bg-white/80 dark:bg-neutral-950/80',
            'backdrop-blur-md',
          ]"
        >
          <div
            :class="[
              'drag-region',
              'absolute left-0 top-0',
              'h-full w-full flex items-center justify-center',
              'text-1.5rem text-primary-600 dark:text-primary-400 font-normal',
              'select-none',
              'animate-flash animate-duration-5s animate-count-infinite',
            ]"
          >
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
      v-if="false"
      class="absolute left-0 top-0 z-99 h-full w-full flex cursor-grab items-center justify-center overflow-hidden drag-region"
    >
      <div
        class="absolute h-32 w-full flex items-center justify-center overflow-hidden rounded-xl"
        bg="white/80 dark:neutral-950/80" backdrop-blur="md"
      >
        <div class="wall absolute top-0 h-8" />
        <div class="absolute left-0 top-0 h-full w-full flex animate-flash animate-duration-5s animate-count-infinite select-none items-center justify-center text-1.5rem text-primary-400 font-normal drag-region">
          DRAG HERE TO MOVE
        </div>
        <div class="wall absolute bottom-0 h-8 drag-region" />
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
    <div v-if="isAroundWindowBorderFor250Ms && !isLoading" class="pointer-events-none absolute left-0 top-0 z-999 h-full w-full">
      <div
        :class="[
          'b-primary/50',
          'h-full w-full animate-flash animate-duration-3s animate-count-infinite b-4 rounded-2xl',
        ]"
      />
    </div>
  </Transition>
</template>

<style scoped>
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
