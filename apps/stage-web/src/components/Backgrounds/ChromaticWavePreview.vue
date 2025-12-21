<script setup lang="ts">
import AnimatedWave from '../Widgets/AnimatedWave.vue'
import Cross from './Cross.vue'
</script>

<template>
  <Cross>
    <AnimatedWave
      fill-color="linear-gradient(120deg, hsl(var(--chromatic-hue) 72% 75%), hsl(var(--chromatic-hue) 70% 62%))"
      class="h-full w-full"
    >
      <div class="relative h-full w-full from-black/10 via-black/0 to-black/0 bg-gradient-to-b" />
    </AnimatedWave>
  </Cross>
</template>
