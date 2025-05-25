<script setup lang="ts">
import InteractiveArea from '../components/InteractiveArea.vue'
</script>

<template>
  <InteractiveArea
    class="interaction-area block"
    h-full w-full transition="opacity duration-250"
  />
</template>

<route lang="yaml">
meta:
  layout: stage
</route>
