<script setup lang="ts">
import { ScreenObservation } from '@proj-airi/stage-ui/components'
</script>

<template>
  <ScreenObservation />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.screen-observation.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
