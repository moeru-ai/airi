<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref } from 'vue'

import { releaseTimelineKey } from './release-timeline'

/**
 * One layer of a release area.
 *
 * In `play` mode, the layer enters `at` milliseconds after mount with the AIRI blur fade:
 * from 3px blur and 0 opacity to sharp and opaque in 500ms. In `static` mode, it shows at once.
 */
const props = withDefaults(defineProps<{
  at?: number
}>(), {
  at: 0,
})

const mode = inject(releaseTimelineKey, 'static')
const entered = ref(mode === 'static')
let timer: ReturnType<typeof setTimeout> | undefined

onMounted(() => {
  if (!entered.value)
    timer = setTimeout(() => entered.value = true, props.at)
})

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div
    data-release-layer
    :data-release-at="props.at"
    :class="[
      'transition-[opacity,filter,transform] duration-500 ease-out motion-reduce:transition-none',
      entered ? 'opacity-100 blur-0 translate-y-0' : 'opacity-0 blur-[3px] translate-y-1.5',
    ]"
  >
    <slot />
  </div>
</template>
