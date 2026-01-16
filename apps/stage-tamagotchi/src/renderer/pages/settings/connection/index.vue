<script setup lang="ts">
import ConnectionSettings from '@proj-airi/stage-pages/pages/settings/connection/ConnectionSettings.vue'
</script>

<template>
  <ConnectionSettings>
    <template #platform-specific />
  </ConnectionSettings>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
