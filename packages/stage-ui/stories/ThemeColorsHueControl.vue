<script setup lang="ts">
import { VAR_HUE } from '@proj-airi/unocss-preset-chromatic'
import { onMounted, ref, watch } from 'vue'

const DEFAULT_THEME_COLORS_HUE = 220.44

const themeColorsHue = ref(DEFAULT_THEME_COLORS_HUE)

function resetToDefault() {
  themeColorsHue.value = DEFAULT_THEME_COLORS_HUE
}

onMounted(() => {
  const hue = document.documentElement.style.getPropertyValue(VAR_HUE)
  const hueF = Number.parseFloat(hue)
  themeColorsHue.value = hueF >= 0 && hueF <= 360 ? hueF : DEFAULT_THEME_COLORS_HUE
  document.documentElement.style.setProperty(VAR_HUE, themeColorsHue.value.toString())
})

watch(themeColorsHue, () => {
  document.documentElement.style.setProperty(VAR_HUE, themeColorsHue.value.toString())
})
</script>

<template>
  <div px-4 py-2 flex="~ col">
    <input
      v-model="themeColorsHue"
      type="range"
      min="0"
      max="360"
      step="0.01"
      class="chromatic-hue-slider"
    >
    <button
      class="mt-2 rounded-md px-2 py-1 text-xs transition-colors"
      bg="neutral-200 dark:neutral-800 hover:neutral-200 dark:hover:neutral-700"
      text="neutral-700 dark:neutral-300"
      @click="resetToDefault"
    >
      Reset to Default
    </button>
  </div>
</template>

<style>
.chromatic-hue-slider {
  outline: none;
  --at-apply: rounded-lg appearance-none h-10;
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
}

.chromatic-hue-slider::-webkit-slider-thumb {
  --at-apply: w-1 h-12 appearance-none rounded-md bg-neutral-600 cursor-pointer shadow-lg border-2 border-neutral-500
    hover: bg-neutral-800 transition-colors duration-200;
}

.htw-dark .chromatic-hue-slider::-webkit-slider-thumb {
  --at-apply: w-1 h-12 appearance-none rounded-md bg-neutral-100 cursor-pointer shadow-md border-2 border-white
    hover: bg-neutral-300 transition-colors duration-200;
}

.chromatic-hue-slider::-moz-range-thumb {
  --at-apply: w-1 h-12 appearance-none rounded-md bg-neutral-600 cursor-pointer shadow-lg border-2 border-neutral-500
    hover: bg-neutral-800 transition-colors duration-200;
}

.htw-dark .chromatic-hue-slider::-moz-range-thumb {
  --at-apply: w-1 h-12 appearance-none rounded-md bg-neutral-100 cursor-pointer shadow-md border-2 border-white
    hover: bg-neutral-300 transition-colors duration-200;
}
</style>
