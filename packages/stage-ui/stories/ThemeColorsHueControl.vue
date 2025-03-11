<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

const DEFAULT_THEME_COLORS_HUE = 354.31

const themeColorsHue = ref(DEFAULT_THEME_COLORS_HUE)

function resetToDefault() {
  themeColorsHue.value = DEFAULT_THEME_COLORS_HUE
}

onMounted(() => {
  const hue = document.documentElement.style.getPropertyValue('--theme-colors-hue')
  const hueF = Number.parseFloat(hue)
  themeColorsHue.value = hueF >= 0 && hueF <= 360 ? hueF : DEFAULT_THEME_COLORS_HUE
})

watch(themeColorsHue, () => {
  document.documentElement.style.setProperty('--theme-colors-hue', themeColorsHue.value.toString())
})
</script>

<template>
  <div px-4 py-2>
    <input
      v-model="themeColorsHue"
      type="range"
      min="0"
      max="360"
      step="0.01"
      class="theme-hue-slider"
    >

    <button
      class="mt-2 rounded-md bg-neutral-100 px-2 py-1 text-xs transition-colors dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700"
      @click="resetToDefault"
    >
      Reset to Default
    </button>
  </div>
</template>
