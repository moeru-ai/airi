<script setup lang="ts">
import WindowControls from './window-controls.vue'

import { useWindowControls } from '../../composables/use-window-controls'

defineProps<{
  title?: string
  /** Shows the title in a lighter color, for a fallback such as the title of a chat that has none yet. */
  titleMuted?: boolean
  icon?: string
  /** Lets the page background show through, for pages that paint up to the top of the window. */
  transparent?: boolean
}>()

const emit = defineEmits<{
  titleClick: []
}>()

const { reservesSystemControls } = useWindowControls()
</script>

<template>
  <div
    data-testid="window-title-bar"
    top="0"
    fixed z-100 h-11 w-full flex select-none items-center drag-region
    :class="[
      reservesSystemControls ? 'pl-20' : 'pl-4',
      !transparent && 'bg-neutral-100 dark:bg-neutral-900',
    ]"
  >
    <div
      v-if="title || icon"
      bg="hover:neutral-200 hover:dark:neutral-800"
      transition="all duration-200 ease-in-out"
      min-w-0 flex cursor-pointer select-none items-center gap-2 rounded-md px-1.5 py-0.5
      class="[-webkit-app-region:no-drag]"
      @click="emit('titleClick')"
    >
      <div v-if="icon" :class="icon" shrink-0 select-none text="neutral-400 dark:neutral-500" whitespace-nowrap />
      <!-- A long title, for example the title of a chat, keeps one line and ends with an ellipsis. -->
      <div min-w-0>
        <span block select-none truncate text-sm :class="titleMuted ? 'text-neutral-400 dark:text-neutral-500' : ''">{{ title }}</span>
      </div>
    </div>
    <div h-full min-w-0 flex-1 drag-region />
    <div
      flex items-center gap-1 pr-3
      class="[-webkit-app-region:no-drag]"
    >
      <slot name="actions" />
    </div>
    <WindowControls />
    <!--
      NOTICE:
      The planned collapse feature was not implemented. Keep this icon hidden until the feature exists.
      https://github.com/moeru-ai/airi/issues/1835#issuecomment-4487178613
    -->
    <!--
    <div
      bg="hover:neutral-200 hover:dark:neutral-800"
      transition="all duration-200 ease-in-out"
      flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-0.5
    >
      <div i-solar:info-circle-bold text="neutral-400 dark:neutral-500" whitespace-nowrap />
    </div>
    -->
  </div>
</template>
