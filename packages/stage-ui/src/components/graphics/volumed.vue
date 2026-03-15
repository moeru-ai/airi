<script setup lang="ts">
defineProps<{
  perspective?: number
  transform?: string
}>()
</script>

<template>
  <div
    class="volumed"
    :style="{
      perspective: `${perspective}px`,
      transform,
    }"
  >
    <slot />
  </div>
</template>

<style scoped>
.volumed {
  transform-style: preserve-3d;
  width: fit-content;
  height: fit-content;
}
</style>
