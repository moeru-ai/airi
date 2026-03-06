<script setup lang="ts">
import { MessagingMatrix } from '@proj-airi/stage-ui/components'
</script>

<template>
  <MessagingMatrix />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.messaging-matrix.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
