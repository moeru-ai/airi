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
  titleKey: settings.pages.connection.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.connection.description
  icon: i-solar:wi-fi-router-bold-duotone
  settingsEntry: true
  order: 8
  stageTransition:
    name: slide
</route>
