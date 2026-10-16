<script setup lang="ts">
import { reactive } from 'vue'

import ToolCallScreenshot from './tool-call-screenshot.vue'

/** The screenshots of one read image call, with the file name and the pixel size of each. */
const props = defineProps<{
  urls: string[]
  fileName?: string
}>()

/** The pixel size of each screenshot, read when it loads. */
const sizes = reactive(new Map<string, string>())

function recordSize(url: string, event: Event) {
  const image = event.target as HTMLImageElement
  sizes.set(url, `${image.naturalWidth} × ${image.naturalHeight}`)
}
</script>

<template>
  <div :class="['flex flex-col gap-2']">
    <div v-for="url in props.urls" :key="url" :class="['flex flex-col gap-1.5']">
      <ToolCallScreenshot :url="url" :title="props.fileName ?? ''" @load="recordSize(url, $event)" />
      <div :class="['flex justify-between gap-2 text-[11px]', 'text-neutral-500 dark:text-neutral-400']">
        <span :class="['min-w-0 truncate']">{{ props.fileName }}</span>
        <span :class="['shrink-0 tabular-nums']">{{ sizes.get(url) }}</span>
      </div>
    </div>
  </div>
</template>
