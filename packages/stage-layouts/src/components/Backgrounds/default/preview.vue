<script setup lang="ts">
import { PartAnimatedWave, PatternCross } from '.'
</script>

<template>
  <PatternCross class="default-background">
    <PartAnimatedWave
      fill-color="var(--default-background-wave)"
      class="h-full w-full"
    >
      <div class="relative h-full w-full from-black/10 via-black/0 to-black/0 bg-gradient-to-b" />
    </PartAnimatedWave>
  </PatternCross>
</template>

<style scoped>
/* In CSS, so the wave follows the theme hue (including `dynamic-hue`) and dark mode. */
.default-background {
  --default-background-wave: color-mix(in srgb, theme('colors.primary.100') 80%, oklch(100% 0 360));
}

.dark .default-background {
  --default-background-wave: theme('colors.primary.900');
}
</style>
