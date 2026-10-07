<script setup lang="ts">
import { shallowRef, watch } from 'vue'

const props = withDefaults(defineProps<{
  /** The newest microphone level, from 0 to 1. Each new value adds one bar while `active` is true. */
  level: number
  active: boolean
  /**
   * Number of bars. At the host's 20 Hz level rate, 48 bars show about 2.4 seconds.
   * @default 48
   */
  bars?: number
}>(), { bars: 48 })

const history = shallowRef<number[]>(Array.from<number>({ length: props.bars }).fill(0))

// Each new level adds one bar. The host sends about 20 levels per second, so an identical repeat is rare and only skips one bar.
watch(() => [props.level, props.active] as const, ([level, active]) => {
  if (!active)
    return
  history.value = [...history.value.slice(1 - props.bars), level]
})

watch(() => props.active, (active) => {
  if (active)
    history.value = Array.from<number>({ length: props.bars }).fill(0)
})
</script>

<template>
  <div aria-hidden="true" :class="['h-5 min-w-0 flex flex-1 items-center gap-[2px] overflow-hidden']">
    <span
      v-for="(value, index) in history"
      :key="index"
      :class="['min-w-[2px] flex-1 rounded-full bg-current transition-[height] duration-75 motion-reduce:transition-none']"
      :style="{ height: `${Math.max(12, Math.round(value * 100))}%`, opacity: 0.35 + value * 0.65 }"
    />
  </div>
</template>
