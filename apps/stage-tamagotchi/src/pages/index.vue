<template>
  <div
    :class="[modeIndicatorClass, {
      'op-0': windowControlStore.isIgnoringMouseEvent && !isClickThrough && !isFirstTime,
      // Fix: Only apply pointer-events-none if it's click-through and not over the UI
    }]"
    max-h="[100vh]"
    max-w="[100vw]"
    flex="~ col"
    relative z-2 h-full overflow-hidden rounded-xl
    transition="opacity duration-500 ease-in-out"
  >
    <div relative h-full w-full items-end gap-2 class="view">
      <WidgetStage
        ref="widgetStageRef"
        h-full w-full flex-1
        :focus-at="live2dFocusAt" :scale="scale"
        :x-offset="positionInPercentageString.x"
        :y-offset="positionInPercentageString.y" mb="<md:18"
      />
      <ResourceStatusIsland ref="resourceStatusIslandRef" />
      <div
        ref="buttonsContainerRef"
        absolute bottom-4 left-4 flex gap-1 op-0 transition="opacity duration-500"
        :class="{
          'pointer-events-none': isClickThrough && !isOverUI,
          'show-on-hover': !windowControlStore.isIgnoringMouseEvent && (!isClickThrough || isOverUI),
        }"
      >
        <div
          border="solid 2 primary-100 "
          text="lg primary-400 hover:primary-600  placeholder:primary-400 placeholder:hover:primary-600"
          bg="primary-50 dark:primary-50" max-h="[10lh]" min-h="[1lh]"
          flex cursor-pointer items-center justify-center rounded-l-xl p-4 transition-colors
          @click="openChat"
        >
          <div i-solar:chat-line-bold-duotone />
        </div>
        <div
          border="solid 2 primary-100 "
          text="lg primary-400 hover:primary-600  placeholder:primary-400 placeholder:hover:primary-600"
          bg="primary-50 dark:primary-50" max-h="[10lh]" min-h="[1lh]"
          flex cursor-pointer items-center justify-center rounded-r-xl p-4 transition-colors
          @click="openSettings"
        >
          <div i-solar:settings-bold-duotone />
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
      data-tauri-drag-region
      class="absolute left-0 top-0 z-999 h-full w-full flex cursor-grab items-center justify-center overflow-hidden"
    >
      <div
        class="absolute h-32 w-full flex items-center justify-center overflow-hidden rounded-xl"
        bg="white/80 dark:neutral-950/80" backdrop-blur="md"
      >
        <div class="wall absolute top-0 h-8" />
        <div data-tauri-drag-region class="absolute left-0 top-0 h-full w-full flex animate-flash animate-duration-5s animate-count-infinite select-none items-center justify-center text-1.5rem text-primary-400 font-normal">
          DRAG HERE TO MOVE
        </div>
        <div data-tauri-drag-region class="wall absolute bottom-0 h-8" />
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
