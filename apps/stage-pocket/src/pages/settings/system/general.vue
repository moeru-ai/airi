<script setup lang="ts">
import SettingsGeneralFields from '@proj-airi/stage-pages/components/settings-general-fields.vue'
</script>

<template>
  <SettingsGeneralFields />
</template>

<!-- TODO: any solution to avoid these duplicate code? -->
<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
