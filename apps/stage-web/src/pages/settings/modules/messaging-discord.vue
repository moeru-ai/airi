<script setup lang="ts">
import { MessagingDiscord } from '@proj-airi/stage-ui/components'
</script>

<template>
  <MessagingDiscord />
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
