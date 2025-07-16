<script setup lang="ts">
const props = defineProps<{
  disabled?: boolean
  class?: string
}>()

const colorValue = defineModel<string>('colorValue', {
  type: String,
  default: '',
})
</script>

<template>
  <input
    v-model="colorValue"
    type="range" min="0" max="360" step="0.01"
    class="color-hue-range"
    transition="all ease-in-out duration-250"
    :disabled="props.disabled"
    :class="[
      props.disabled ? 'opacity-25 cursor-not-allowed' : 'cursor-pointer',
      props.class || '',
    ]"
  >
</template>

<style scoped>
.color-hue-range {
  --at-apply: appearance-none h-10 rounded-lg;
  background: linear-gradient(
    to right,
    oklch(85% 0.2 0),
    oklch(85% 0.2 60),
    oklch(85% 0.2 120),
    oklch(85% 0.2 180),
    oklch(85% 0.2 240),
    oklch(85% 0.2 300),
    oklch(85% 0.2 360)
  );

  &::-webkit-slider-thumb {
    --at-apply: w-1 h-12 hover:w-2 hover:h-13 appearance-none rounded-md bg-neutral-600 cursor-pointer shadow-lg border-2 border-neutral-500
      hover: bg-neutral-800 transition-colors,transform,width,height duration-200 cursor-col-resize;
  }

  .dark &::-webkit-slider-thumb {
    --at-apply: w-1 h-12 hover:w-2 hover:h-13 appearance-none rounded-md bg-neutral-100 cursor-pointer shadow-md border-2 border-white
      hover: bg-neutral-300 transition-colors,transform,width,height duration-200 cursor-col-resize;
  }

  &::-moz-range-thumb {
    --at-apply: w-1 h-12 hover:w-2 hover:h-13 appearance-none rounded-md bg-neutral-600 cursor-pointer shadow-lg border-2 border-neutral-500
      hover: bg-neutral-800 transition-colors,transform,width,height duration-200 cursor-col-resize;
  }

  .dark &::-moz-range-thumb {
    --at-apply: w-1 h-12 hover:w-2 hover:h-13 appearance-none rounded-md bg-neutral-100 cursor-pointer shadow-md border-2 border-white
      hover: bg-neutral-300 transition-colors,transform,width,height duration-200 cursor-col-resize;
  }
}
</style>
