<script setup lang="ts">
defineProps<{
  size?: number
}>()
</script>

<template>
  <div
    class="test-dummy-flat"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
    }"
  >
    <div class="marker" />
  </div>
</template>

<style scoped>
.test-dummy-flat {
  display: inline-block;
  position: relative;
}

.test-dummy-flat .marker {
  position: absolute;
  inset: 0;
  background: conic-gradient(#ffeb3b 0deg 90deg, #000 90deg 180deg, #ffeb3b 180deg 270deg, #000 270deg 360deg);
  border-radius: 50%;
  box-shadow: 0 4px 12px rgba(185, 185, 185, 0.2);
}

.dark .test-dummy-flat .marker {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}
</style>
