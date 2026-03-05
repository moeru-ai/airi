<script setup lang="ts">
import { APISettings } from '@proj-airi/stage-ui/components'
</script>

<template>
  <APISettings />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.api.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.api.description
  icon: i-solar:server-bold-duotone
  settingsEntry: true
  order: 5
  stageTransition:
    name: slide
</route>
