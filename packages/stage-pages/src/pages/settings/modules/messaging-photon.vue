<script setup lang="ts">
import { MessagingPhoton } from '@proj-airi/stage-ui/components'
</script>

<template>
  <MessagingPhoton />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.messaging-photon.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
